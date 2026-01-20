import { getEncoding } from 'js-tiktoken';
import { DocumentStructureParser, HierarchyNode, DocumentStructure } from './structure-parser';
import { SemanticBoundaryDetector, SemanticAnalysisResult } from './semantic-analyzer';

export interface ChunkingConfig {
  min_chunk_size: number; // minimum tokens per chunk
  max_chunk_size: number; // maximum tokens per chunk
  target_chunk_size: number; // preferred tokens per chunk
  overlap_percentage: number; // percentage overlap between chunks
  prefer_semantic_boundaries: boolean; // prioritize semantic over structural
  respect_section_boundaries: boolean; // never split across major sections
  include_heading_context: boolean; // include parent headings in chunks
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  tokens: number;
  position: number; // absolute position in document

  // Hierarchy metadata
  heading_path: string[]; // ["1. Introduction", "1.2 Background"]
  hierarchy_level: number; // depth in document tree
  parent_section_id?: string;
  chunk_type: 'heading' | 'paragraph' | 'mixed' | 'table' | 'list' | 'code';

  // Semantic metadata
  semantic_density: number; // coherence score
  topic_keywords: string[]; // extracted key terms
  has_overlap_previous: boolean;
  has_overlap_next: boolean;
  overlap_text?: string; // overlapping portion

  // Relationships
  previous_chunk_id?: string;
  next_chunk_id?: string;
  sibling_chunk_ids: string[]; // same-level chunks
  child_chunk_ids: string[]; // nested content

  metadata: {
    created_at: Date;
    source_file_id: string;
    source_file_name: string;
    chunking_method: 'structural' | 'semantic' | 'hybrid';
  };
}

export interface HierarchyTreeNode {
  node: HierarchyNode;
  children: HierarchyTreeNode[];
  parent?: HierarchyTreeNode;
  tokens: number;
  depth: number;
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  total_chunks: number;
  total_tokens: number;
  average_chunk_size: number;
  overlap_efficiency: number; // how much useful overlap was created
  semantic_coherence: number; // average coherence across chunks
  hierarchy_preservation: number; // how well hierarchy was maintained
}

export class SemanticChunker {
  private structureParser = new DocumentStructureParser();
  private semanticDetector = new SemanticBoundaryDetector();
  private tokenizer = getEncoding('cl100k_base'); // GPT-4 tokenizer
  private chunkCounter = 0;

  private readonly defaultConfig: ChunkingConfig = {
    min_chunk_size: 300,
    max_chunk_size: 500,
    target_chunk_size: 400,
    overlap_percentage: 10,
    prefer_semantic_boundaries: true,
    respect_section_boundaries: true,
    include_heading_context: true
  };

  /**
   * Get adaptive chunk configuration based on document size
   */
  private getAdaptiveChunkConfig(totalTokens: number): Partial<ChunkingConfig> {
    if (totalTokens < 1000) {
      return {
        min_chunk_size: 100,
        target_chunk_size: 150,
        max_chunk_size: 300
      };
    } else if (totalTokens < 3000) {
      return {
        min_chunk_size: 200,
        target_chunk_size: 300,
        max_chunk_size: 400
      };
    } else if (totalTokens < 10000) {
      return {
        min_chunk_size: 300,
        target_chunk_size: 400,
        max_chunk_size: 500
      };
    } else {
      return {
        min_chunk_size: 400,
        target_chunk_size: 450,
        max_chunk_size: 500
      };
    }
  }

  /**
   * Build hierarchy tree from flat node structure
   */
  private buildHierarchyTree(structure: DocumentStructure): HierarchyTreeNode[] {
    const nodeMap = new Map<string, HierarchyTreeNode>();
    const rootNodes: HierarchyTreeNode[] = [];

    // Create tree nodes from flat structure
    for (const node of structure.nodes) {
      const treeNode: HierarchyTreeNode = {
        node,
        children: [],
        tokens: this.countTokens(node.content),
        depth: node.level || 0
      };
      nodeMap.set(node.id, treeNode);
    }

    // Build parent-child relationships
    for (const node of structure.nodes) {
      const treeNode = nodeMap.get(node.id)!;

      if (node.parent_id) {
        const parent = nodeMap.get(node.parent_id);
        if (parent) {
          parent.children.push(treeNode);
          treeNode.parent = parent;
        } else {
          // Orphaned node, add to root
          rootNodes.push(treeNode);
        }
      } else {
        rootNodes.push(treeNode);
      }
    }

    // Fix malformed hierarchies (e.g., H3 directly under H1)
    this.fixHierarchyLevels(rootNodes);

    return rootNodes;
  }

  /**
   * Fix malformed heading hierarchies
   */
  private fixHierarchyLevels(nodes: HierarchyTreeNode[]): void {
    const fixLevels = (node: HierarchyTreeNode, expectedLevel: number = 1) => {
      if (node.node.type === 'heading') {
        // Ensure heading level makes sense in context
        const actualLevel = node.node.level;
        const parentLevel = node.parent?.node.type === 'heading' ? node.parent.node.level : 0;

        // If there's a gap (e.g., H3 under H1), adjust logically
        if (actualLevel > parentLevel + 1) {
          node.depth = parentLevel + 1;
        } else {
          node.depth = actualLevel;
        }
      }

      // Recursively fix children
      for (const child of node.children) {
        fixLevels(child, node.depth + 1);
      }
    };

    for (const root of nodes) {
      fixLevels(root);
    }
  }

  /**
   * Bottom-up chunking with semantic boundaries
   */
  private async chunkHierarchyBottomUp(
    treeNodes: HierarchyTreeNode[],
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    for (const treeNode of treeNodes) {
      const nodeChunks = await this.processTreeNode(
        treeNode,
        structure,
        semanticAnalysis,
        documentId,
        sourceFileId,
        sourceFileName,
        config
      );
      chunks.push(...nodeChunks);
    }

    return chunks;
  }

  /**
   * Process a single tree node bottom-up
   */
  private async processTreeNode(
    treeNode: HierarchyTreeNode,
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    // If this is a leaf node (no children), return as single chunk
    if (treeNode.children.length === 0) {
      const flatNodes = this.flattenTreeNode(treeNode);
      return [this.createChunkFromNodes(
        flatNodes,
        structure,
        documentId,
        sourceFileId,
        sourceFileName,
        'hybrid'
      )];
    }

    // For nodes with children, always try to split by child boundaries first
    const childChunks: DocumentChunk[] = [];

    // Process each child as a potential separate chunk
    for (const child of treeNode.children) {
      const childTokens = this.calculateTreeNodeTokens(child);

      if (childTokens >= config.min_chunk_size || child.node.type === 'heading') {
        // Child is large enough or is a heading, process it separately
        const chunks = await this.processTreeNode(
          child,
          structure,
          semanticAnalysis,
          documentId,
          sourceFileId,
          sourceFileName,
          config
        );
        childChunks.push(...chunks);
      } else {
        // Child is too small, will be grouped later
        const flatNodes = this.flattenTreeNode(child);
        const chunk = this.createChunkFromNodes(
          flatNodes,
          structure,
          documentId,
          sourceFileId,
          sourceFileName,
          'hybrid'
        );
        childChunks.push(chunk);
      }
    }

    // Group small adjacent chunks if they can be combined
    const groupedChunks = this.groupSimilarChunks(childChunks, semanticAnalysis, config);

    // If this node has its own content (heading), decide where to place it
    if (treeNode.node.content.trim() && treeNode.node.type === 'heading') {
      const nodeContent = [treeNode.node];
      const nodeTokens = this.countTokens(treeNode.node.content);

      // For small headings, try to combine with first child
      if (nodeTokens < config.min_chunk_size && groupedChunks.length > 0) {
        const firstChunk = groupedChunks[0];
        if (firstChunk.tokens + nodeTokens <= config.max_chunk_size) {
          // Combine heading with first child chunk
          const combinedNodes = [...nodeContent, ...this.getNodesFromChunk(firstChunk, structure)];
          groupedChunks[0] = this.createChunkFromNodes(
            combinedNodes,
            structure,
            documentId,
            sourceFileId,
            sourceFileName,
            'hybrid'
          );
        } else {
          // Create separate chunk for heading
          const nodeChunk = this.createChunkFromNodes(
            nodeContent,
            structure,
            documentId,
            sourceFileId,
            sourceFileName,
            'hybrid'
          );
          groupedChunks.unshift(nodeChunk);
        }
      } else {
        // Heading is large enough or no children, create separate chunk
        const nodeChunk = this.createChunkFromNodes(
          nodeContent,
          structure,
          documentId,
          sourceFileId,
          sourceFileName,
          'hybrid'
        );
        groupedChunks.unshift(nodeChunk);
      }
    }

    return groupedChunks;
  }

  /**
   * Calculate total tokens for a tree node including all descendants
   */
  private calculateTreeNodeTokens(treeNode: HierarchyTreeNode): number {
    let total = this.countTokens(treeNode.node.content);
    for (const child of treeNode.children) {
      total += this.calculateTreeNodeTokens(child);
    }
    return total;
  }

  /**
   * Group similar chunks based on semantic similarity and size constraints
   */
  private groupSimilarChunks(
    chunks: DocumentChunk[],
    semanticAnalysis: SemanticAnalysisResult,
    config: ChunkingConfig
  ): DocumentChunk[] {
    if (chunks.length <= 1) return chunks;

    const grouped: DocumentChunk[] = [];
    let currentGroup: DocumentChunk[] = [chunks[0]];
    let currentTokens = chunks[0].tokens;

    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];
      const lastChunk = currentGroup[currentGroup.length - 1];

      const canCombineSize = currentTokens + chunk.tokens <= config.max_chunk_size;
      const shouldCombineSmall = currentTokens < config.min_chunk_size || chunk.tokens < config.min_chunk_size;
      const isCodeBlock = chunk.chunk_type === 'code' && lastChunk.chunk_type === 'code';
      const isRelatedContent = this.areChunksRelated(lastChunk, chunk);
      const hasStrongSemanticBoundary = this.hasStrongSemanticBoundary(lastChunk, chunk, semanticAnalysis);

      // More aggressive combining logic
      const shouldCombine = canCombineSize && (
        shouldCombineSmall ||  // Combine if either chunk is too small
        isCodeBlock ||         // Keep code blocks together
        isRelatedContent       // Related content (headings with content)
      ) && !hasStrongSemanticBoundary;

      if (shouldCombine) {
        currentGroup.push(chunk);
        currentTokens += chunk.tokens;
      } else {
        // Finalize current group
        if (currentGroup.length === 1) {
          grouped.push(currentGroup[0]);
        } else {
          // Merge chunks in current group
          const mergedChunk = this.mergeChunks(currentGroup);
          grouped.push(mergedChunk);
        }

        // Start new group
        currentGroup = [chunk];
        currentTokens = chunk.tokens;
      }
    }

    // Handle final group
    if (currentGroup.length === 1) {
      grouped.push(currentGroup[0]);
    } else {
      const mergedChunk = this.mergeChunks(currentGroup);
      grouped.push(mergedChunk);
    }

    return grouped;
  }

  /**
   * Check if chunks are related (heading with content, code blocks, etc.)
   */
  private areChunksRelated(chunk1: DocumentChunk, chunk2: DocumentChunk): boolean {
    // Heading followed by content
    if (chunk1.chunk_type === 'heading' && chunk2.chunk_type !== 'heading') {
      return true;
    }

    // Code blocks should stay together
    if (chunk1.chunk_type === 'code' || chunk2.chunk_type === 'code') {
      return true;
    }

    // List items with their explanatory text
    if (chunk1.chunk_type === 'paragraph' && chunk2.chunk_type === 'list') {
      return true;
    }

    // Same hierarchy level content
    if (chunk1.hierarchy_level === chunk2.hierarchy_level &&
        chunk1.hierarchy_level > 0) {
      return true;
    }

    return false;
  }

  /**
   * Check for strong semantic boundaries that should not be crossed
   */
  private hasStrongSemanticBoundary(
    chunk1: DocumentChunk,
    chunk2: DocumentChunk,
    semanticAnalysis: SemanticAnalysisResult
  ): boolean {
    // Different major heading sections (H1, H2)
    if (chunk1.hierarchy_level <= 2 && chunk2.hierarchy_level <= 2 &&
        chunk1.chunk_type === 'heading' && chunk2.chunk_type === 'heading') {
      return true;
    }

    // Check semantic analysis boundaries
    const boundary = semanticAnalysis.boundaries.find(b =>
      Math.abs(b.position - chunk1.position) <= 1 ||
      Math.abs(b.position - chunk2.position) <= 1
    );

    return boundary && boundary.boundary_strength > 0.8;
  }

  /**
   * Check if two chunks can be semantically grouped
   */
  private areChunksSemanticallyGroupable(
    chunk1: DocumentChunk,
    chunk2: DocumentChunk,
    semanticAnalysis: SemanticAnalysisResult
  ): boolean {
    // Check for semantic boundary between chunks
    const boundary = semanticAnalysis.boundaries.find(b =>
      Math.abs(b.position - chunk1.position) <= 2 ||
      Math.abs(b.position - chunk2.position) <= 2
    );

    if (boundary && boundary.boundary_strength > 0.7) {
      return false; // Strong semantic boundary, don't group
    }

    // Check topic keyword overlap
    const keywords1 = new Set(chunk1.topic_keywords);
    const keywords2 = new Set(chunk2.topic_keywords);
    const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
    const union = new Set([...keywords1, ...keywords2]);

    const similarity = intersection.size / Math.max(union.size, 1);
    return similarity > 0.3; // 30% keyword overlap threshold
  }

  /**
   * Flatten tree node into list of hierarchy nodes
   */
  private flattenTreeNode(treeNode: HierarchyTreeNode): HierarchyNode[] {
    const nodes: HierarchyNode[] = [treeNode.node];

    for (const child of treeNode.children) {
      nodes.push(...this.flattenTreeNode(child));
    }

    return nodes;
  }

  /**
   * Check if content can be combined with first chunk
   */
  private canCombineWithFirstChunk(
    nodes: HierarchyNode[],
    chunk: DocumentChunk,
    config: ChunkingConfig
  ): boolean {
    const nodeTokens = this.calculateNodesTokens(nodes);
    return nodeTokens + chunk.tokens <= config.max_chunk_size;
  }

  /**
   * Extract hierarchy nodes from a chunk (placeholder implementation)
   */
  private getNodesFromChunk(chunk: DocumentChunk, structure: DocumentStructure): HierarchyNode[] {
    // This is a simplified approach - in practice, you'd maintain node references in chunks
    // For now, we'll parse the content back to nodes
    return structure.nodes.filter(node =>
      chunk.content.includes(node.content.substring(0, 50))
    );
  }

  /**
   * Merge multiple chunks into one
   */
  private mergeChunks(chunks: DocumentChunk[]): DocumentChunk {
    if (chunks.length === 1) return chunks[0];

    const mergedContent = chunks.map(chunk => chunk.content).join('\n\n');
    const mergedTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
    const mergedKeywords = Array.from(new Set(
      chunks.flatMap(chunk => chunk.topic_keywords)
    ));

    // Use first chunk as template
    const firstChunk = chunks[0];

    return {
      ...firstChunk,
      content: mergedContent,
      tokens: mergedTokens,
      topic_keywords: mergedKeywords,
      semantic_density: chunks.reduce((sum, chunk) => sum + chunk.semantic_density, 0) / chunks.length,
      chunk_type: 'mixed'
    };
  }

  /**
   * Main chunking method that combines structural and semantic analysis
   */
  public async chunkDocument(
    content: string,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: Partial<ChunkingConfig> = {}
  ): Promise<ChunkingResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    this.chunkCounter = 0;

    // Step 1: Parse document structure
    const structure = this.structureParser.parseDocument(content);

    // Step 2: Analyze semantic boundaries
    const semanticAnalysis = await this.semanticDetector.analyzeSemanticBoundaries(structure.nodes);

    // Step 3: Apply hybrid chunking algorithm
    const chunks = await this.applyHybridChunking(
      structure,
      semanticAnalysis,
      documentId,
      sourceFileId,
      sourceFileName,
      finalConfig
    );

    // Step 4: Post-process chunks (add overlaps, relationships)
    const processedChunks = this.postProcessChunks(chunks, finalConfig);

    // Step 5: Calculate metrics
    const metrics = this.calculateChunkingMetrics(processedChunks, semanticAnalysis);

    return {
      chunks: processedChunks,
      total_chunks: processedChunks.length,
      total_tokens: processedChunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
      average_chunk_size: processedChunks.reduce((sum, chunk) => sum + chunk.tokens, 0) / processedChunks.length,
      ...metrics
    };
  }

  /**
   * Apply hybrid chunking algorithm combining structural and semantic analysis
   */
  private async applyHybridChunking(
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    // Calculate total document tokens for adaptive sizing
    const totalTokens = structure.nodes.reduce((sum, node) =>
      sum + this.countTokens(node.content), 0
    );

    // Get adaptive chunk configuration based on document size
    const adaptiveConfig = this.getAdaptiveChunkConfig(totalTokens);
    const finalConfig = { ...config, ...adaptiveConfig };

    // Build hierarchy tree from flat structure
    const hierarchyTree = this.buildHierarchyTree(structure);

    // Apply bottom-up chunking with semantic boundaries
    const chunks = await this.chunkHierarchyBottomUp(
      hierarchyTree,
      structure,
      semanticAnalysis,
      documentId,
      sourceFileId,
      sourceFileName,
      finalConfig
    );

    // Add overlaps between chunks
    this.addChunkOverlaps(chunks, finalConfig);

    return chunks;
  }

  /**
   * Identify non-overlapping sections that serve as natural chunk boundaries
   */
  private identifyMajorSections(structure: DocumentStructure): Array<{
    heading: HierarchyNode;
    nodes: HierarchyNode[];
  }> {
    const sections: Array<{ heading: HierarchyNode; nodes: HierarchyNode[] }> = [];
    const processedNodes = new Set<string>();

    // Sort nodes by position to process in document order
    const sortedNodes = [...structure.nodes].sort((a, b) => a.position - b.position);

    for (const node of sortedNodes) {
      // Skip if already processed
      if (processedNodes.has(node.id)) continue;

      // Only process headings as section boundaries
      if (node.type === 'heading' && node.level <= 2) {
        const sectionNodes = this.collectSectionContent(node, sortedNodes, processedNodes);

        sections.push({
          heading: node,
          nodes: sectionNodes
        });

        // Mark all nodes in this section as processed
        sectionNodes.forEach(n => processedNodes.add(n.id));
      }
    }

    return sections;
  }

  /**
   * Collect content for a section until the next heading of same or higher level
   */
  private collectSectionContent(
    heading: HierarchyNode,
    allNodes: HierarchyNode[],
    processedNodes: Set<string>
  ): HierarchyNode[] {
    const sectionNodes: HierarchyNode[] = [heading];
    const headingPosition = heading.position;
    const headingLevel = heading.level;

    // Find content until next heading of same or higher level
    for (let i = headingPosition + 1; i < allNodes.length; i++) {
      const node = allNodes.find(n => n.position === i);
      if (!node || processedNodes.has(node.id)) continue;

      // Stop if we hit another heading of same or higher level
      if (node.type === 'heading' && node.level <= headingLevel) {
        break;
      }

      sectionNodes.push(node);
    }

    return sectionNodes;
  }

  /**
   * Chunk a specific section using hybrid approach
   */
  private async chunkSection(
    section: { heading: HierarchyNode; nodes: HierarchyNode[] },
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    // Calculate total tokens in section
    const sectionTokens = this.calculateNodesTokens(section.nodes);

    if (sectionTokens <= config.max_chunk_size) {
      // Section fits in one chunk
      const chunk = this.createChunkFromNodes(
        section.nodes,
        structure,
        documentId,
        sourceFileId,
        sourceFileName,
        'structural'
      );
      chunks.push(chunk);
    } else {
      // Section needs to be split - use semantic analysis
      const subChunks = await this.chunkNodeSequence(
        section.nodes,
        structure,
        semanticAnalysis,
        documentId,
        sourceFileId,
        sourceFileName,
        config
      );
      chunks.push(...subChunks);
    }

    return chunks;
  }

  /**
   * Chunk a sequence of nodes using semantic boundaries
   */
  private async chunkNodeSequence(
    nodes: HierarchyNode[],
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    // Use semantic analysis to find optimal split points
    const splitPoints = this.findOptimalSplitPoints(nodes, semanticAnalysis, config);

    let currentStart = 0;
    for (const splitPoint of [...splitPoints, nodes.length]) {
      if (splitPoint > currentStart) {
        const chunkNodes = nodes.slice(currentStart, splitPoint);
        const chunk = this.createChunkFromNodes(
          chunkNodes,
          structure,
          documentId,
          sourceFileId,
          sourceFileName,
          'hybrid'
        );
        chunks.push(chunk);
        currentStart = splitPoint;
      }
    }

    return chunks;
  }

  /**
   * Find optimal split points based on semantic analysis and chunk size constraints
   */
  private findOptimalSplitPoints(
    nodes: HierarchyNode[],
    semanticAnalysis: SemanticAnalysisResult,
    config: ChunkingConfig
  ): number[] {
    const splitPoints: number[] = [];
    let currentTokens = 0;
    let lastViableSplit = 0;

    for (let i = 0; i < nodes.length; i++) {
      const nodeTokens = this.countTokens(nodes[i].content);
      currentTokens += nodeTokens;

      // Check if we've reached target size and have a viable split point
      if (currentTokens >= config.target_chunk_size) {
        const semanticSplit = this.findNearestSemanticBoundary(
          i,
          semanticAnalysis,
          config.prefer_semantic_boundaries
        );

        if (semanticSplit > lastViableSplit) {
          splitPoints.push(semanticSplit);
          lastViableSplit = semanticSplit;
          currentTokens = this.calculateTokensFromPosition(nodes, semanticSplit);
        }
      }

      // Force split if we exceed max size
      if (currentTokens >= config.max_chunk_size) {
        if (i > lastViableSplit) {
          splitPoints.push(i);
          lastViableSplit = i;
          currentTokens = 0;
        }
      }
    }

    return splitPoints;
  }

  /**
   * Find optimal break point for chunking when approaching target size
   */
  private findOptimalBreakPoint(
    sortedNodes: HierarchyNode[],
    currentPosition: number,
    semanticAnalysis: SemanticAnalysisResult,
    config: ChunkingConfig
  ): number {
    const lookAheadLimit = Math.min(currentPosition + 5, sortedNodes.length - 1);
    let bestBreakPoint = currentPosition;
    let bestScore = 0;

    // Look ahead for good break points
    for (let i = currentPosition; i <= lookAheadLimit; i++) {
      const node = sortedNodes[i];
      let score = 0;

      // Prefer breaking after headings (natural section boundaries)
      if (node.type === 'heading') {
        score += 3;
      }

      // Prefer breaking after paragraphs (complete thoughts)
      if (node.type === 'paragraph') {
        score += 2;
      }

      // Check for semantic boundaries
      const semanticBoundary = semanticAnalysis.boundaries.find(
        boundary => boundary.position === i
      );
      if (semanticBoundary) {
        score += semanticBoundary.boundary_strength * 2;
      }

      // Penalize breaking in the middle of lists or tables
      if (node.type === 'list' || node.type === 'table') {
        score -= 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestBreakPoint = i;
      }
    }

    return bestBreakPoint;
  }

  /**
   * Calculate overlap nodes between chunks (10% overlap)
   */
  private calculateOverlapNodes(
    chunkNodes: HierarchyNode[],
    config: ChunkingConfig
  ): HierarchyNode[] {
    if (config.overlap_percentage <= 0 || chunkNodes.length === 0) {
      return [];
    }

    const totalTokens = this.calculateNodesTokens(chunkNodes);
    const targetOverlapTokens = Math.floor(totalTokens * (config.overlap_percentage / 100));

    // Take nodes from the end of the chunk for overlap
    const overlapNodes: HierarchyNode[] = [];
    let overlapTokens = 0;

    for (let i = chunkNodes.length - 1; i >= 0 && overlapTokens < targetOverlapTokens; i--) {
      const node = chunkNodes[i];
      const nodeTokens = this.countTokens(node.content);

      // Add node if it doesn't exceed target overlap
      if (overlapTokens + nodeTokens <= targetOverlapTokens * 1.5) { // Allow 50% tolerance
        overlapNodes.unshift(node);
        overlapTokens += nodeTokens;
      } else {
        break;
      }
    }

    return overlapNodes;
  }

  /**
   * Find the nearest semantic boundary to a given position
   */
  private findNearestSemanticBoundary(
    position: number,
    semanticAnalysis: SemanticAnalysisResult,
    preferSemantic: boolean
  ): number {
    if (!preferSemantic) return position;

    // Look for strong semantic boundaries near the position
    const nearbyBoundaries = semanticAnalysis.boundaries.filter(
      boundary => Math.abs(boundary.position - position) <= 3
    );

    if (nearbyBoundaries.length > 0) {
      // Choose the strongest boundary
      const strongest = nearbyBoundaries.reduce((best, current) =>
        current.boundary_strength > best.boundary_strength ? current : best
      );
      return strongest.position;
    }

    return position;
  }

  /**
   * Create a chunk from a sequence of nodes
   */
  private createChunkFromNodes(
    nodes: HierarchyNode[],
    structure: DocumentStructure,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    chunkingMethod: 'structural' | 'semantic' | 'hybrid'
  ): DocumentChunk {
    const chunkId = this.generateChunkId();
    const content = this.combineNodesContent(nodes, structure);
    const tokens = this.countTokens(content);

    // Extract metadata from nodes
    const headingPath = this.extractHeadingPath(nodes, structure);
    const hierarchyLevel = this.calculateHierarchyLevel(nodes);
    const chunkType = this.determineChunkType(nodes);
    const topicKeywords = this.extractTopicKeywords(content);

    // Calculate semantic density (coherence within chunk)
    const semanticDensity = this.calculateChunkCoherence(nodes);

    return {
      id: chunkId,
      document_id: documentId,
      content,
      tokens,
      position: this.chunkCounter,
      heading_path: headingPath,
      hierarchy_level: hierarchyLevel,
      chunk_type: chunkType,
      semantic_density: semanticDensity,
      topic_keywords: topicKeywords,
      has_overlap_previous: false,
      has_overlap_next: false,
      sibling_chunk_ids: [],
      child_chunk_ids: [],
      metadata: {
        created_at: new Date(),
        source_file_id: sourceFileId,
        source_file_name: sourceFileName,
        chunking_method: chunkingMethod
      }
    };
  }

  /**
   * Combine nodes content with proper formatting
   */
  private combineNodesContent(nodes: HierarchyNode[], structure: DocumentStructure): string {
    const contentParts: string[] = [];

    for (const node of nodes) {
      if (node.type === 'heading') {
        // Add heading with proper formatting
        const prefix = '#'.repeat(node.level);
        contentParts.push(`${prefix} ${node.content}`);
      } else {
        contentParts.push(node.content);
      }
    }

    return contentParts.join('\n\n');
  }

  /**
   * Extract heading path for a chunk
   */
  private extractHeadingPath(nodes: HierarchyNode[], structure: DocumentStructure): string[] {
    // Find the first node and use its path
    const firstNode = nodes[0];
    if (!firstNode) return [];

    // If the first node is a heading, include it in the path
    if (firstNode.type === 'heading') {
      return [...firstNode.path, firstNode.content];
    }

    return firstNode.path;
  }

  /**
   * Calculate the hierarchy level for a chunk
   */
  private calculateHierarchyLevel(nodes: HierarchyNode[]): number {
    const headingNodes = nodes.filter(node => node.type === 'heading');
    if (headingNodes.length > 0) {
      return Math.min(...headingNodes.map(node => node.level));
    }

    // Use the level of the first node
    return nodes[0]?.level || 0;
  }

  /**
   * Determine the primary type of a chunk
   */
  private determineChunkType(nodes: HierarchyNode[]): DocumentChunk['chunk_type'] {
    const types = nodes.map(node => node.type);
    const uniqueTypes = [...new Set(types)];

    if (uniqueTypes.length === 1) {
      return uniqueTypes[0] as DocumentChunk['chunk_type'];
    }

    // Mixed content - determine primary type
    if (types.includes('heading')) return 'heading';
    if (types.includes('table')) return 'table';
    if (types.includes('list')) return 'list';
    if (types.includes('code')) return 'code';

    return 'mixed';
  }

  /**
   * Extract topic keywords from content
   */
  private extractTopicKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Simple frequency analysis
    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  /**
   * Calculate semantic coherence within a chunk
   */
  private calculateChunkCoherence(nodes: HierarchyNode[]): number {
    // Simple heuristic based on content consistency
    if (nodes.length <= 1) return 1.0;

    const allWords = nodes
      .map(node => node.content.toLowerCase().split(/\s+/))
      .flat();

    const uniqueWords = new Set(allWords);
    const totalWords = allWords.length;

    // Higher ratio of unique to total words suggests lower coherence
    return Math.max(0, 1 - (uniqueWords.size / totalWords));
  }

  /**
   * Post-process chunks to add overlaps and relationships
   */
  private postProcessChunks(chunks: DocumentChunk[], config: ChunkingConfig): DocumentChunk[] {
    // Add overlaps between adjacent chunks
    this.addChunkOverlaps(chunks, config);

    // Establish relationships between chunks
    this.establishChunkRelationships(chunks);

    return chunks;
  }

  /**
   * Add overlapping content between adjacent chunks
   */
  private addChunkOverlaps(chunks: DocumentChunk[], config: ChunkingConfig): void {
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i];
      const nextChunk = chunks[i + 1];

      // Calculate overlap size
      const overlapTokens = Math.floor(currentChunk.tokens * (config.overlap_percentage / 100));

      if (overlapTokens > 0) {
        const overlapText = this.extractOverlapText(currentChunk.content, overlapTokens);

        if (overlapText) {
          currentChunk.has_overlap_next = true;
          currentChunk.overlap_text = overlapText;
          nextChunk.has_overlap_previous = true;
        }
      }
    }
  }

  /**
   * Extract overlap text from the end of a chunk
   */
  private extractOverlapText(content: string, targetTokens: number): string | undefined {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length === 0) return undefined;

    // Take sentences from the end until we reach target tokens
    let overlapText = '';
    let tokens = 0;

    for (let i = sentences.length - 1; i >= 0 && tokens < targetTokens; i--) {
      const sentence = sentences[i].trim();
      const sentenceTokens = this.countTokens(sentence);

      if (tokens + sentenceTokens <= targetTokens) {
        overlapText = sentence + '. ' + overlapText;
        tokens += sentenceTokens;
      } else {
        break;
      }
    }

    return overlapText.trim() || undefined;
  }

  /**
   * Establish relationships between chunks
   */
  private establishChunkRelationships(chunks: DocumentChunk[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Set previous/next relationships
      if (i > 0) {
        chunk.previous_chunk_id = chunks[i - 1].id;
      }
      if (i < chunks.length - 1) {
        chunk.next_chunk_id = chunks[i + 1].id;
      }

      // Find sibling chunks (same hierarchy level)
      chunk.sibling_chunk_ids = chunks
        .filter(other =>
          other.id !== chunk.id &&
          other.hierarchy_level === chunk.hierarchy_level
        )
        .map(other => other.id);
    }
  }

  /**
   * Calculate chunking quality metrics
   */
  private calculateChunkingMetrics(
    chunks: DocumentChunk[],
    semanticAnalysis: SemanticAnalysisResult
  ): {
    overlap_efficiency: number;
    semantic_coherence: number;
    hierarchy_preservation: number;
  } {
    const overlapEfficiency = this.calculateOverlapEfficiency(chunks);
    const semanticCoherence = chunks.reduce((sum, chunk) => sum + chunk.semantic_density, 0) / chunks.length;
    const hierarchyPreservation = this.calculateHierarchyPreservation(chunks);

    return {
      overlap_efficiency: overlapEfficiency,
      semantic_coherence: semanticCoherence,
      hierarchy_preservation: hierarchyPreservation
    };
  }

  /**
   * Calculate how efficiently overlaps were created
   */
  private calculateOverlapEfficiency(chunks: DocumentChunk[]): number {
    const chunksWithOverlap = chunks.filter(chunk => chunk.has_overlap_next || chunk.has_overlap_previous);
    return chunksWithOverlap.length / Math.max(1, chunks.length - 1);
  }

  /**
   * Calculate how well document hierarchy was preserved
   */
  private calculateHierarchyPreservation(chunks: DocumentChunk[]): number {
    // Simple heuristic: check if heading paths are consistent
    let consistentPaths = 0;
    for (let i = 1; i < chunks.length; i++) {
      const current = chunks[i];
      const previous = chunks[i - 1];

      // Paths should be related (one is subset of other or they share prefix)
      if (this.arePathsRelated(current.heading_path, previous.heading_path)) {
        consistentPaths++;
      }
    }

    return Math.max(1, chunks.length - 1) > 0 ? consistentPaths / (chunks.length - 1) : 1;
  }

  /**
   * Check if two heading paths are related
   */
  private arePathsRelated(path1: string[], path2: string[]): boolean {
    const minLength = Math.min(path1.length, path2.length);
    for (let i = 0; i < minLength; i++) {
      if (path1[i] !== path2[i]) {
        return i > 0; // Share at least one common prefix level
      }
    }
    return true; // One path is subset of the other
  }

  // Utility methods

  private generateChunkId(): string {
    return `chunk_${++this.chunkCounter}_${Date.now()}`;
  }

  private countTokens(text: string): number {
    try {
      return this.tokenizer.encode(text).length;
    } catch (error) {
      // Fallback to word-based estimation
      return Math.ceil(text.split(/\s+/).length * 0.75);
    }
  }

  private calculateNodesTokens(nodes: HierarchyNode[]): number {
    return nodes.reduce((total, node) => total + this.countTokens(node.content), 0);
  }

  private calculateTokensFromPosition(nodes: HierarchyNode[], position: number): number {
    return nodes.slice(position).reduce((total, node) => total + this.countTokens(node.content), 0);
  }

  private markNodesAsProcessed(nodes: HierarchyNode[], processedSet: Set<string>): void {
    nodes.forEach(node => processedSet.add(node.id));
  }
}