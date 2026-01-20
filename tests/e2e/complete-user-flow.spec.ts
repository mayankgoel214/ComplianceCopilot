import { test, expect } from '@playwright/test';

test.describe('Complete Universal Input Processor User Flow', () => {
  test('should complete the full workflow: auth → project creation → document linking → analysis → results', async ({ page, context }) => {
    // Step 1: Authentication and initial setup
    await test.step('User authentication and initial state', async () => {
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
          uid: 'e2e-test-user',
          email: 'e2e@example.com',
          displayName: 'E2E Test User',
          photoURL: 'https://example.com/photo.jpg',
          accessToken: 'mock-access-token-with-drive-scope',
        }));

        // Mock Google Drive API for document picker
        window.gapi = {
          load: (api: string, callback: Function) => {
            if (api === 'picker') callback();
          },
          picker: {
            DocsView: function() {
              return {
                setMimeTypes: () => ({}),
                setIncludeFolders: () => ({}),
              };
            },
            PickerBuilder: function() {
              return {
                setAppId: () => this,
                setOAuthToken: () => this,
                addView: () => this,
                setCallback: (callback: Function) => {
                  this.pickerCallback = callback;
                  return this;
                },
                build: () => ({
                  setVisible: (visible: boolean) => {
                    if (visible) {
                      // Simulate user selecting compliance documents
                      setTimeout(() => {
                        this.pickerCallback({
                          action: 'picked',
                          docs: [
                            {
                              id: 'e2e-doc-1',
                              name: 'Student Privacy Policy.pdf',
                              mimeType: 'application/pdf',
                              url: 'https://drive.google.com/file/d/e2e-doc-1',
                            },
                            {
                              id: 'e2e-doc-2',
                              name: 'FERPA Compliance Manual.docx',
                              mimeType: 'application/vnd.google-apps.document',
                              url: 'https://drive.google.com/file/d/e2e-doc-2',
                            },
                            {
                              id: 'e2e-doc-3',
                              name: 'Data Processing Agreement.pdf',
                              mimeType: 'application/pdf',
                              url: 'https://drive.google.com/file/d/e2e-doc-3',
                            },
                          ],
                        });
                      }, 500);
                    }
                  },
                }),
              };
            },
          },
        };
      });

      // Mock initial empty projects state
      await page.route('/api/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ projects: [] }),
          });
        }
      });

      await page.goto('/');

      // Should show empty projects state
      await expect(page.getByText('No projects yet')).toBeVisible();
      await expect(page.getByText('Create your first project to get started')).toBeVisible();
    });

    // Step 2: Project Creation
    await test.step('Create new compliance project', async () => {
      // Mock project creation API
      await page.route('/api/projects', async (route) => {
        if (route.request().method() === 'POST') {
          const body = await route.request().postDataJSON();
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              project: {
                id: 'e2e-project-123',
                user_id: 'e2e-test-user',
                name: body.name,
                description: body.description,
                status: 'draft',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            }),
          });
        }
      });

      // Mock updated projects list API
      await page.route('/api/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              projects: [
                {
                  id: 'e2e-project-123',
                  name: 'E2E University FERPA Compliance',
                  description: 'Comprehensive FERPA compliance project for educational institution',
                  status: 'draft',
                  document_count: 0,
                  framework_count: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }),
          });
        }
      });

      // Create first project
      await page.getByRole('button', { name: 'Create Your First Project' }).click();

      await page.getByLabel('Project Name').fill('E2E University FERPA Compliance');
      await page.getByLabel('Description').fill('Comprehensive FERPA compliance project for educational institution with student data handling, privacy policies, and consent procedures.');

      await page.getByRole('button', { name: 'Create Project' }).click();

      // Should show success and navigate to project
      await expect(page.getByText('Project created successfully')).toBeVisible();
      await expect(page).toHaveURL(/\/projects\/e2e-project-123/);
      await expect(page.getByText('E2E University FERPA Compliance')).toBeVisible();
    });

    // Step 3: Project Detail Setup and Document Linking
    await test.step('Link compliance documents from Google Drive', async () => {
      // Mock project detail API
      await page.route('/api/projects/e2e-project-123', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            project: {
              id: 'e2e-project-123',
              name: 'E2E University FERPA Compliance',
              description: 'Comprehensive FERPA compliance project for educational institution',
              status: 'draft',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      });

      // Mock initial empty documents
      await page.route('/api/projects/e2e-project-123/documents', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ documents: [] }),
          });
        }
      });

      // Navigate to Documents tab
      await page.getByRole('tab', { name: 'Documents' }).click();

      // Should show empty documents state
      await expect(page.getByText('No documents linked yet')).toBeVisible();
      await expect(page.getByText('Link documents from Google Drive to get started')).toBeVisible();

      // Mock document linking API
      await page.route('/api/projects/e2e-project-123/documents', async (route) => {
        if (route.request().method() === 'POST') {
          const body = await route.request().postDataJSON();
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              documents: body.documents.map((doc: any, index: number) => ({
                id: `e2e-doc-${index + 1}`,
                project_id: 'e2e-project-123',
                ...doc,
                file_size: Math.floor(Math.random() * 2000000) + 500000,
                last_analyzed: null,
                created_at: new Date().toISOString(),
              })),
            }),
          });
        }
      });

      // Mock updated documents list
      await page.route('/api/projects/e2e-project-123/documents', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              documents: [
                {
                  id: 'e2e-doc-1',
                  project_id: 'e2e-project-123',
                  drive_file_id: 'e2e-doc-1',
                  file_name: 'Student Privacy Policy.pdf',
                  file_type: 'pdf',
                  mime_type: 'application/pdf',
                  file_size: 1587000,
                  last_analyzed: null,
                  created_at: new Date().toISOString(),
                },
                {
                  id: 'e2e-doc-2',
                  project_id: 'e2e-project-123',
                  drive_file_id: 'e2e-doc-2',
                  file_name: 'FERPA Compliance Manual.docx',
                  file_type: 'docx',
                  mime_type: 'application/vnd.google-apps.document',
                  file_size: 945000,
                  last_analyzed: null,
                  created_at: new Date().toISOString(),
                },
                {
                  id: 'e2e-doc-3',
                  project_id: 'e2e-project-123',
                  drive_file_id: 'e2e-doc-3',
                  file_name: 'Data Processing Agreement.pdf',
                  file_type: 'pdf',
                  mime_type: 'application/pdf',
                  file_size: 1234000,
                  last_analyzed: null,
                  created_at: new Date().toISOString(),
                },
              ],
            }),
          });
        }
      });

      // Link documents using Google Drive Picker
      await page.getByRole('button', { name: 'Link Your First Document' }).click();

      // Should show linking progress
      await expect(page.getByText('Linking documents')).toBeVisible();

      // Should show success and linked documents
      await expect(page.getByText('Documents linked successfully')).toBeVisible();
      await expect(page.getByText('Student Privacy Policy.pdf')).toBeVisible();
      await expect(page.getByText('FERPA Compliance Manual.docx')).toBeVisible();
      await expect(page.getByText('Data Processing Agreement.pdf')).toBeVisible();

      // Should show document details
      await expect(page.getByText('1.6 MB')).toBeVisible();
      await expect(page.getByText('Never analyzed')).toBeVisible();
    });

    // Step 4: Document Synchronization
    await test.step('Sync documents to check for updates', async () => {
      // Mock sync API
      await page.route('/api/projects/e2e-project-123/sync', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Documents synced successfully',
            updatedDocuments: 1,
            newDocuments: 0,
          }),
        });
      });

      // Sync documents
      await page.getByRole('button', { name: 'Sync Documents' }).click();

      // Should show sync progress and results
      await expect(page.getByText('Syncing documents')).toBeVisible();
      await expect(page.getByText('Documents synced successfully')).toBeVisible();
      await expect(page.getByText('1 document updated')).toBeVisible();
    });

    // Step 5: Compliance Analysis
    await test.step('Run comprehensive compliance analysis', async () => {
      // Navigate to Analysis tab
      await page.getByRole('tab', { name: 'Analysis' }).click();

      // Should show documents ready for analysis
      await expect(page.getByText('3 documents ready for analysis')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Run Compliance Analysis' })).toBeEnabled();

      // Mock analysis API with realistic response
      await page.route('/api/projects/e2e-project-123/analyze', async (route) => {
        // Simulate realistic analysis time
        await new Promise(resolve => setTimeout(resolve, 3000));

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Analysis completed successfully',
            analysis: {
              processedDocuments: [
                {
                  id: 'e2e-doc-1',
                  name: 'Student Privacy Policy.pdf',
                  contentLength: 18750,
                  mimeType: 'application/pdf',
                },
                {
                  id: 'e2e-doc-2',
                  name: 'FERPA Compliance Manual.docx',
                  contentLength: 24680,
                  mimeType: 'application/vnd.google-apps.document',
                },
                {
                  id: 'e2e-doc-3',
                  name: 'Data Processing Agreement.pdf',
                  contentLength: 12450,
                  mimeType: 'application/pdf',
                },
              ],
              detectedFrameworks: [
                {
                  id: 'framework-1',
                  name: 'FERPA',
                  confidence: 0.94,
                  requirements: {
                    keywords: ['student', 'education', 'academic', 'transcript', 'enrollment', 'directory information'],
                    detectedAt: new Date().toISOString(),
                    contentLength: 55880,
                  },
                },
                {
                  id: 'framework-2',
                  name: 'GDPR',
                  confidence: 0.82,
                  requirements: {
                    keywords: ['personal data', 'privacy', 'data protection', 'consent', 'european'],
                    detectedAt: new Date().toISOString(),
                    contentLength: 55880,
                  },
                },
                {
                  id: 'framework-3',
                  name: 'HIPAA',
                  confidence: 0.34,
                  requirements: {
                    keywords: ['health', 'medical'],
                    detectedAt: new Date().toISOString(),
                    contentLength: 55880,
                  },
                },
              ],
              overallScore: 87.3,
              totalGaps: 2,
              highPriorityGaps: 1,
              recommendations: 4,
              contentAnalyzed: 55880,
              assessmentId: 'e2e-assessment-456',
            },
            analyzedAt: new Date().toISOString(),
          }),
        });
      });

      // Start analysis
      await page.getByRole('button', { name: 'Run Compliance Analysis' }).click();

      // Should show analysis progress
      await expect(page.getByText('Analyzing documents')).toBeVisible();
      await expect(page.getByText('Processing 3 documents for compliance frameworks')).toBeVisible();
      await expect(page.getByRole('progressbar')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();

      // Should show completion
      await expect(page.getByText('Analysis completed successfully')).toBeVisible();

      // Should show analysis summary
      await expect(page.getByText('Overall Score: 87.3%')).toBeVisible();
      await expect(page.getByText('3 frameworks detected')).toBeVisible();
      await expect(page.getByText('2 gaps identified')).toBeVisible();
      await expect(page.getByText('1 high priority issue')).toBeVisible();

      // Should show detected frameworks with confidence
      await expect(page.getByText('FERPA')).toBeVisible();
      await expect(page.getByText('94% confidence')).toBeVisible();
      await expect(page.getByText('GDPR')).toBeVisible();
      await expect(page.getByText('82% confidence')).toBeVisible();
      await expect(page.getByText('HIPAA')).toBeVisible();
      await expect(page.getByText('34% confidence')).toBeVisible();
    });

    // Step 6: View Detailed Results
    await test.step('Review detailed compliance results and recommendations', async () => {
      // Mock detailed results API
      await page.route('/api/projects/e2e-project-123/results', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            assessment: {
              id: 'e2e-assessment-456',
              project_id: 'e2e-project-123',
              overall_score: 87.3,
              created_at: new Date().toISOString(),
            },
            frameworks: [
              {
                id: 'framework-1',
                framework_name: 'FERPA',
                confidence_score: 0.94,
                requirements: {
                  keywords: ['student', 'education', 'academic', 'transcript', 'enrollment', 'directory information'],
                },
              },
              {
                id: 'framework-2',
                framework_name: 'GDPR',
                confidence_score: 0.82,
                requirements: {
                  keywords: ['personal data', 'privacy', 'data protection', 'consent', 'european'],
                },
              },
            ],
            gaps: [
              {
                requirement_id: 'ferpa-consent-001',
                title: 'Student Consent Documentation',
                description: 'Missing explicit student consent documentation for directory information disclosure',
                severity: 'high',
                recommendation: 'Implement comprehensive consent collection and documentation system',
              },
              {
                requirement_id: 'gdpr-processing-002',
                title: 'Data Processing Transparency',
                description: 'Data processing purposes could be more transparent in privacy notices',
                severity: 'medium',
                recommendation: 'Update privacy policy with detailed data processing explanations',
              },
            ],
            recommendations: [
              {
                title: 'Enhance FERPA Compliance Documentation',
                description: 'Strengthen FERPA compliance through improved documentation and consent processes',
                action_items: [
                  'Develop comprehensive consent collection system',
                  'Create FERPA compliance training materials',
                  'Implement directory information opt-out procedures',
                  'Establish regular compliance auditing process',
                ],
                priority: 'high',
                estimated_effort: '4-6 weeks',
              },
              {
                title: 'Improve GDPR Data Processing Transparency',
                description: 'Enhance transparency in data processing activities for international compliance',
                action_items: [
                  'Update privacy policy with detailed processing purposes',
                  'Implement data subject rights request procedures',
                  'Create data retention schedule documentation',
                ],
                priority: 'medium',
                estimated_effort: '2-3 weeks',
              },
            ],
          }),
        });
      });

      // Navigate to detailed results
      await page.getByRole('button', { name: 'View Detailed Results' }).click();

      // Should be on Results tab
      await expect(page.getByRole('tab', { name: 'Results' })).toHaveAttribute('aria-selected', 'true');

      // Should show comprehensive results
      await expect(page.getByText('Overall Compliance Score')).toBeVisible();
      await expect(page.getByText('87.3%')).toBeVisible();

      // Should show framework details
      await expect(page.getByText('Detected Frameworks')).toBeVisible();
      await expect(page.getByText('FERPA')).toBeVisible();
      await expect(page.getByText('94%')).toBeVisible();
      await expect(page.getByText('GDPR')).toBeVisible();
      await expect(page.getByText('82%')).toBeVisible();

      // Should show compliance gaps
      await expect(page.getByText('Compliance Gaps')).toBeVisible();
      await expect(page.getByText('Student Consent Documentation')).toBeVisible();
      await expect(page.getByText('High Priority')).toBeVisible();
      await expect(page.getByText('Data Processing Transparency')).toBeVisible();
      await expect(page.getByText('Medium Priority')).toBeVisible();

      // Should show actionable recommendations
      await expect(page.getByText('Recommendations')).toBeVisible();
      await expect(page.getByText('Enhance FERPA Compliance Documentation')).toBeVisible();
      await expect(page.getByText('Develop comprehensive consent collection system')).toBeVisible();
      await expect(page.getByText('4-6 weeks')).toBeVisible();

      await expect(page.getByText('Improve GDPR Data Processing Transparency')).toBeVisible();
      await expect(page.getByText('Update privacy policy with detailed processing purposes')).toBeVisible();
      await expect(page.getByText('2-3 weeks')).toBeVisible();
    });

    // Step 7: Final Verification - Return to Dashboard
    await test.step('Verify completed project in dashboard', async () => {
      // Mock updated project status
      await page.route('/api/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              projects: [
                {
                  id: 'e2e-project-123',
                  name: 'E2E University FERPA Compliance',
                  description: 'Comprehensive FERPA compliance project for educational institution',
                  status: 'completed',
                  document_count: 3,
                  framework_count: 2,
                  latest_compliance_score: 87.3,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }),
          });
        }
      });

      // Navigate back to dashboard
      await page.getByRole('link', { name: 'Dashboard' }).click();

      // Should show completed project with updated status
      await expect(page.getByText('Your Projects')).toBeVisible();
      await expect(page.getByText('E2E University FERPA Compliance')).toBeVisible();
      await expect(page.getByText('Completed')).toBeVisible();
      await expect(page.getByText('3 documents')).toBeVisible();
      await expect(page.getByText('2 frameworks')).toBeVisible();
      await expect(page.getByText('87.3% score')).toBeVisible();
    });
  });

  test('should handle the complete flow on mobile devices', async ({ page, context }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Run the same complete flow but verify mobile responsiveness
    await test.step('Complete mobile workflow verification', async () => {
      // Mock authentication for mobile
      await context.addCookies([
        {
          name: 'firebase-auth-token',
          value: 'mobile-mock-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.addInitScript(() => {
        window.localStorage.setItem('firebase:authUser:mock-project-id:[DEFAULT]', JSON.stringify({
          uid: 'mobile-test-user',
          email: 'mobile@example.com',
          displayName: 'Mobile Test User',
          accessToken: 'mobile-mock-token',
        }));
      });

      // Mock APIs for mobile flow
      await page.route('/api/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              projects: [
                {
                  id: 'mobile-project',
                  name: 'Mobile FERPA Test',
                  description: 'Mobile compliance test',
                  status: 'completed',
                  document_count: 2,
                  framework_count: 1,
                  latest_compliance_score: 85,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }),
          });
        }
      });

      await page.goto('/');

      // Should work on mobile viewport
      await expect(page.getByText('Your Projects')).toBeVisible();
      await expect(page.getByText('Mobile FERPA Test')).toBeVisible();
      await expect(page.getByText('85% score')).toBeVisible();

      // Mobile navigation should work
      await page.getByText('Mobile FERPA Test').click();
      await expect(page).toHaveURL(/\/projects\/mobile-project/);
    });
  });
});