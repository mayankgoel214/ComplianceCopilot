#!/usr/bin/env python3

import chromadb
import sys

def debug_chromadb():
    print("=== ChromaDB Debug Info ===")

    try:
        # Connect to ChromaDB
        client = chromadb.HttpClient(host="localhost", port=8000)

        # Test connection
        heartbeat = client.heartbeat()
        print(f"[OK] ChromaDB connection successful: {heartbeat}")

        # List all collections
        collections = client.list_collections()
        print(f"\n[INFO] Found {len(collections)} collections:")

        for collection in collections:
            print(f"\n  Collection: {collection.name}")
            print(f"  ID: {collection.id}")
            print(f"  Metadata: {collection.metadata}")

            # Get collection details
            try:
                count = collection.count()
                print(f"  Document count: {count}")

                if count > 0:
                    # Get a sample of documents
                    sample = collection.get(limit=3, include=["metadatas", "documents"])
                    print(f"  Sample documents:")
                    for i, doc in enumerate(sample['documents'][:3]):
                        preview = doc[:100] + "..." if len(doc) > 100 else doc
                        print(f"    [{i}]: {preview}")
                        if sample['metadatas'] and i < len(sample['metadatas']):
                            metadata = sample['metadatas'][i]
                            print(f"         Metadata: {metadata}")

            except Exception as e:
                print(f"  [ERROR] Error getting collection details: {e}")

    except Exception as e:
        print(f"[ERROR] ChromaDB connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    debug_chromadb()