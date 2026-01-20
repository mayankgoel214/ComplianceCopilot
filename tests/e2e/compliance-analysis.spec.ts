import { test, expect } from '@playwright/test';

test.describe('Compliance Analysis Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock Firebase authentication state
    await context.addCookies([
      {
        name: 'firebase-auth-token',
        value: 'mock-auth-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.addInitScript(() => {
      // Mock Firebase auth state
      window.localStorage.setItem('firebase:authUser:mock-project-id:[DEFAULT]', JSON.stringify({
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
        accessToken: 'mock-access-token-with-drive-scope',
      }));
    });

    // Mock project API responses
    await page.route('/api/projects/test-project-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          project: {
            id: 'test-project-1',
            name: 'FERPA Compliance Project',
            description: 'Educational privacy compliance for student data handling',
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      });
    });

    // Mock documents with some linked documents
    await page.route('/api/projects/test-project-1/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [
            {
              id: 'doc-1',
              project_id: 'test-project-1',
              drive_file_id: 'file-1',
              file_name: 'Student Privacy Policy.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              file_size: 2048000,
              last_analyzed: null,
              created_at: new Date().toISOString(),
            },
            {
              id: 'doc-2',
              project_id: 'test-project-1',
              drive_file_id: 'file-2',
              file_name: 'Data Handling Procedures.docx',
              file_type: 'docx',
              mime_type: 'application/vnd.google-apps.document',
              file_size: 1024000,
              last_analyzed: null,
              created_at: new Date().toISOString(),
            },
            {
              id: 'doc-3',
              project_id: 'test-project-1',
              drive_file_id: 'file-3',
              file_name: 'Student Enrollment Form.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              file_size: 512000,
              last_analyzed: null,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    // Mock analysis API response
    await page.route('/api/projects/test-project-1/analyze', async (route) => {
      // Simulate analysis time
      await new Promise(resolve => setTimeout(resolve, 2000));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Analysis completed successfully',
          analysis: {
            processedDocuments: [
              {
                id: 'doc-1',
                name: 'Student Privacy Policy.pdf',
                contentLength: 15420,
                mimeType: 'application/pdf',
              },
              {
                id: 'doc-2',
                name: 'Data Handling Procedures.docx',
                contentLength: 8930,
                mimeType: 'application/vnd.google-apps.document',
              },
              {
                id: 'doc-3',
                name: 'Student Enrollment Form.pdf',
                contentLength: 4560,
                mimeType: 'application/pdf',
              },
            ],
            detectedFrameworks: [
              {
                id: 'framework-1',
                name: 'FERPA',
                confidence: 0.92,
                requirements: {
                  keywords: ['student', 'education', 'academic', 'enrollment', 'directory information'],
                  detectedAt: new Date().toISOString(),
                  contentLength: 28910,
                },
              },
              {
                id: 'framework-2',
                name: 'GDPR',
                confidence: 0.78,
                requirements: {
                  keywords: ['personal data', 'privacy', 'data protection', 'consent'],
                  detectedAt: new Date().toISOString(),
                  contentLength: 28910,
                },
              },
            ],
            overallScore: 84.5,
            totalGaps: 3,
            highPriorityGaps: 1,
            recommendations: 5,
            contentAnalyzed: 28910,
            assessmentId: 'assessment-123',
          },
          analyzedAt: new Date().toISOString(),
        }),
      });
    });

    // Mock analysis results API
    await page.route('/api/projects/test-project-1/results', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          assessment: {
            id: 'assessment-123',
            project_id: 'test-project-1',
            overall_score: 84.5,
            created_at: new Date().toISOString(),
          },
          frameworks: [
            {
              id: 'framework-1',
              framework_name: 'FERPA',
              confidence_score: 0.92,
              requirements: {
                keywords: ['student', 'education', 'academic', 'enrollment', 'directory information'],
              },
            },
            {
              id: 'framework-2',
              framework_name: 'GDPR',
              confidence_score: 0.78,
              requirements: {
                keywords: ['personal data', 'privacy', 'data protection', 'consent'],
              },
            },
          ],
          gaps: [
            {
              requirement_id: 'ferpa-001',
              title: 'FERPA Documentation Gap',
              description: 'Missing or incomplete FERPA compliance documentation',
              severity: 'high',
              recommendation: 'Review and update FERPA compliance procedures',
            },
            {
              requirement_id: 'gdpr-001',
              title: 'GDPR Data Processing Notice',
              description: 'Data processing notice needs to be more explicit',
              severity: 'medium',
              recommendation: 'Update privacy policy to include detailed data processing information',
            },
            {
              requirement_id: 'ferpa-002',
              title: 'Student Directory Information',
              description: 'Student directory information disclosure policy unclear',
              severity: 'medium',
              recommendation: 'Clarify directory information disclosure procedures',
            },
          ],
          recommendations: [
            {
              title: 'Improve FERPA Compliance',
              description: 'Enhance FERPA compliance to meet industry standards',
              action_items: [
                'Review current FERPA policies',
                'Update documentation templates',
                'Train staff on FERPA requirements',
              ],
              priority: 'high',
              estimated_effort: '2-4 weeks',
            },
            {
              title: 'Enhance GDPR Compliance',
              description: 'Strengthen GDPR compliance for international students',
              action_items: [
                'Review data processing procedures',
                'Update consent mechanisms',
                'Implement data subject rights procedures',
              ],
              priority: 'medium',
              estimated_effort: '3-6 weeks',
            },
          ],
        }),
      });
    });
  });

  test('should display analysis tab with documents ready for analysis', async ({ page }) => {
    await page.goto('/projects/test-project-1');

    // Click on Analysis tab
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Should show documents available for analysis
    await expect(page.getByText('3 documents ready for analysis')).toBeVisible();
    await expect(page.getByText('Student Privacy Policy.pdf')).toBeVisible();
    await expect(page.getByText('Data Handling Procedures.docx')).toBeVisible();
    await expect(page.getByText('Student Enrollment Form.pdf')).toBeVisible();

    // Should show analyze button
    await expect(page.getByRole('button', { name: 'Run Compliance Analysis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Compliance Analysis' })).toBeEnabled();
  });

  test('should run compliance analysis and show progress', async ({ page }) => {
    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Start analysis
    await page.getByRole('button', { name: 'Run Compliance Analysis' }).click();

    // Should show analysis in progress
    await expect(page.getByText('Analyzing documents')).toBeVisible();
    await expect(page.getByText('Processing 3 documents for compliance frameworks')).toBeVisible();

    // Should show progress indicator
    await expect(page.getByRole('progressbar')).toBeVisible();

    // Should disable the analyze button during analysis
    await expect(page.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();
  });

  test('should display analysis results after completion', async ({ page }) => {
    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Run analysis
    await page.getByRole('button', { name: 'Run Compliance Analysis' }).click();

    // Wait for analysis to complete
    await expect(page.getByText('Analysis completed successfully')).toBeVisible();

    // Should show analysis summary
    await expect(page.getByText('Overall Score: 84.5%')).toBeVisible();
    await expect(page.getByText('2 frameworks detected')).toBeVisible();
    await expect(page.getByText('3 gaps identified')).toBeVisible();
    await expect(page.getByText('1 high priority issue')).toBeVisible();

    // Should show detected frameworks
    await expect(page.getByText('FERPA')).toBeVisible();
    await expect(page.getByText('92% confidence')).toBeVisible();
    await expect(page.getByText('GDPR')).toBeVisible();
    await expect(page.getByText('78% confidence')).toBeVisible();
  });

  test('should navigate to results tab after analysis', async ({ page }) => {
    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Run analysis
    await page.getByRole('button', { name: 'Run Compliance Analysis' }).click();

    // Wait for completion and click view results
    await expect(page.getByText('Analysis completed successfully')).toBeVisible();
    await page.getByRole('button', { name: 'View Detailed Results' }).click();

    // Should navigate to Results tab
    await expect(page.getByRole('tab', { name: 'Results' })).toHaveAttribute('aria-selected', 'true');
  });

  test('should display detailed compliance results', async ({ page }) => {
    await page.goto('/projects/test-project-1');

    // Go directly to Results tab
    await page.getByRole('tab', { name: 'Results' }).click();

    // Should show overall score
    await expect(page.getByText('Overall Compliance Score')).toBeVisible();
    await expect(page.getByText('84.5%')).toBeVisible();

    // Should show detected frameworks
    await expect(page.getByText('Detected Frameworks')).toBeVisible();
    await expect(page.getByText('FERPA')).toBeVisible();
    await expect(page.getByText('GDPR')).toBeVisible();

    // Should show compliance gaps
    await expect(page.getByText('Compliance Gaps')).toBeVisible();
    await expect(page.getByText('FERPA Documentation Gap')).toBeVisible();
    await expect(page.getByText('High Priority')).toBeVisible();
    await expect(page.getByText('GDPR Data Processing Notice')).toBeVisible();
    await expect(page.getByText('Medium Priority')).toBeVisible();

    // Should show recommendations
    await expect(page.getByText('Recommendations')).toBeVisible();
    await expect(page.getByText('Improve FERPA Compliance')).toBeVisible();
    await expect(page.getByText('Enhance GDPR Compliance')).toBeVisible();
  });

  test('should handle analysis with no documents', async ({ page }) => {
    // Mock empty documents response
    await page.route('/api/projects/test-project-1/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [],
        }),
      });
    });

    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Should show no documents message
    await expect(page.getByText('No documents to analyze')).toBeVisible();
    await expect(page.getByText('Link some documents first')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Compliance Analysis' })).toBeDisabled();
  });

  test('should handle analysis errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('/api/projects/test-project-1/analyze', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Analysis failed due to document processing error',
        }),
      });
    });

    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Run analysis
    await page.getByRole('button', { name: 'Run Compliance Analysis' }).click();

    // Should show error message
    await expect(page.getByText('Analysis failed')).toBeVisible();
    await expect(page.getByText('document processing error')).toBeVisible();

    // Should re-enable the analyze button
    await expect(page.getByRole('button', { name: 'Run Compliance Analysis' })).toBeEnabled();
  });

  test('should show framework confidence levels visually', async ({ page }) => {
    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Results' }).click();

    // Should show confidence levels as progress bars or percentages
    await expect(page.getByText('92%')).toBeVisible(); // FERPA confidence
    await expect(page.getByText('78%')).toBeVisible(); // GDPR confidence

    // Should show confidence level indicators
    await expect(page.locator('[data-testid="confidence-high"]')).toBeVisible();
    await expect(page.locator('[data-testid="confidence-medium"]')).toBeVisible();
  });

  test('should display actionable recommendations', async ({ page }) => {
    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Results' }).click();

    // Should show recommendations with action items
    await expect(page.getByText('Improve FERPA Compliance')).toBeVisible();
    await expect(page.getByText('Review current FERPA policies')).toBeVisible();
    await expect(page.getByText('Update documentation templates')).toBeVisible();
    await expect(page.getByText('Train staff on FERPA requirements')).toBeVisible();

    // Should show effort estimates
    await expect(page.getByText('2-4 weeks')).toBeVisible();
    await expect(page.getByText('3-6 weeks')).toBeVisible();

    // Should show priority levels
    await expect(page.getByText('High Priority')).toBeVisible();
    await expect(page.getByText('Medium Priority')).toBeVisible();
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/projects/test-project-1');

    // Navigate to analysis tab
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Should display mobile-friendly layout
    await expect(page.getByText('3 documents ready for analysis')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Compliance Analysis' })).toBeVisible();

    // Run analysis on mobile
    await page.getByRole('button', { name: 'Run Compliance Analysis' }).click();
    await expect(page.getByText('Analyzing documents')).toBeVisible();

    // Results should be mobile-friendly
    await expect(page.getByText('Analysis completed successfully')).toBeVisible();
  });

  test('should handle large document sets efficiently', async ({ page }) => {
    // Mock many documents
    const manyDocuments = Array.from({ length: 25 }, (_, i) => ({
      id: `doc-${i + 1}`,
      project_id: 'test-project-1',
      drive_file_id: `file-${i + 1}`,
      file_name: `Compliance Document ${i + 1}.pdf`,
      file_type: 'pdf',
      mime_type: 'application/pdf',
      file_size: Math.floor(Math.random() * 5000000),
      last_analyzed: null,
      created_at: new Date().toISOString(),
    }));

    await page.route('/api/projects/test-project-1/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: manyDocuments,
        }),
      });
    });

    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Analysis' }).click();

    // Should show large document count
    await expect(page.getByText('25 documents ready for analysis')).toBeVisible();

    // Should handle analysis of many documents
    await page.getByRole('button', { name: 'Run Compliance Analysis' }).click();
    await expect(page.getByText('Processing 25 documents')).toBeVisible();
  });
});