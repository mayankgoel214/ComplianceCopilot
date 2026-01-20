import { test, expect } from '@playwright/test';

test.describe('Document Management Flow', () => {
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

      // Mock Google Drive API
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
                    // Simulate user selecting files after a short delay
                    setTimeout(() => {
                      this.pickerCallback({
                        action: 'picked',
                        docs: [
                          {
                            id: 'mock-file-1',
                            name: 'Privacy Policy.pdf',
                            mimeType: 'application/pdf',
                            url: 'https://drive.google.com/file/d/mock-file-1',
                          },
                          {
                            id: 'mock-file-2',
                            name: 'Student Handbook.docx',
                            mimeType: 'application/vnd.google-apps.document',
                            url: 'https://drive.google.com/file/d/mock-file-2',
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

    // Mock project API responses
    await page.route('/api/projects/test-project-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          project: {
            id: 'test-project-1',
            name: 'Test Compliance Project',
            description: 'Testing document management',
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      });
    });

    // Mock documents API responses
    await page.route('/api/projects/test-project-1/documents', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: [
              {
                id: 'doc-1',
                project_id: 'test-project-1',
                drive_file_id: 'existing-file-1',
                file_name: 'Existing Document.pdf',
                file_type: 'pdf',
                mime_type: 'application/pdf',
                drive_url: 'https://drive.google.com/file/d/existing-file-1',
                file_size: 1024000,
                last_modified: new Date().toISOString(),
                last_analyzed: null,
                created_at: new Date().toISOString(),
              },
            ],
          }),
        });
      } else if (route.request().method() === 'POST') {
        const body = await route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: body.documents.map((doc: any, index: number) => ({
              id: `new-doc-${index + 1}`,
              project_id: 'test-project-1',
              ...doc,
              created_at: new Date().toISOString(),
            })),
          }),
        });
      }
    });

    // Mock document sync API
    await page.route('/api/projects/test-project-1/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Documents synced successfully',
          updatedDocuments: 2,
          newDocuments: 0,
        }),
      });
    });
  });

  test('should display documents tab with existing documents', async ({ page }) => {
    await page.goto('/projects/test-project-1');

    // Click on Documents tab
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Should show documents list
    await expect(page.getByText('Existing Document.pdf')).toBeVisible();
    await expect(page.getByText('1.0 MB')).toBeVisible();
    await expect(page.getByText('Never analyzed')).toBeVisible();
  });

  test('should open Google Drive Picker when clicking link documents', async ({ page }) => {
    await page.goto('/projects/test-project-1');

    // Click on Documents tab
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Click link documents button
    await page.getByRole('button', { name: 'Link Documents' }).click();

    // Should show picker loading state briefly, then documents should be added
    await expect(page.getByText('Linking documents')).toBeVisible();

    // Wait for picker to complete and documents to be linked
    await expect(page.getByText('Documents linked successfully')).toBeVisible();
    await expect(page.getByText('Privacy Policy.pdf')).toBeVisible();
    await expect(page.getByText('Student Handbook.docx')).toBeVisible();
  });

  test('should handle Google Drive Picker cancellation', async ({ page }) => {
    // Override the picker to simulate cancellation
    await page.addInitScript(() => {
      if (window.gapi && window.gapi.picker) {
        const originalPickerBuilder = window.gapi.picker.PickerBuilder;
        window.gapi.picker.PickerBuilder = function() {
          const builder = originalPickerBuilder.call(this);
          const originalSetCallback = builder.setCallback;
          builder.setCallback = function(callback: Function) {
            this.pickerCallback = callback;
            return this;
          };
          const originalBuild = builder.build;
          builder.build = function() {
            const picker = originalBuild.call(this);
            const originalSetVisible = picker.setVisible;
            picker.setVisible = function(visible: boolean) {
              if (visible) {
                // Simulate user cancelling the picker
                setTimeout(() => {
                  this.pickerCallback({
                    action: 'cancel',
                  });
                }, 300);
              }
              return originalSetVisible.call(this, visible);
            };
            return picker;
          };
          return builder;
        };
      }
    });

    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Click link documents button
    await page.getByRole('button', { name: 'Link Documents' }).click();

    // Should handle cancellation gracefully
    await expect(page.getByText('Link Documents')).toBeVisible(); // Button should be available again
  });

  test('should sync document metadata from Google Drive', async ({ page }) => {
    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Click sync documents button
    await page.getByRole('button', { name: 'Sync Documents' }).click();

    // Should show sync in progress
    await expect(page.getByText('Syncing documents')).toBeVisible();

    // Should show sync completion
    await expect(page.getByText('Documents synced successfully')).toBeVisible();
    await expect(page.getByText('2 documents updated')).toBeVisible();
  });

  test('should display document file types and sizes correctly', async ({ page }) => {
    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Should show file type indicators
    await expect(page.getByText('PDF')).toBeVisible();

    // Should show human-readable file sizes
    await expect(page.getByText('1.0 MB')).toBeVisible();

    // Should show last modified dates
    await expect(page.getByText(/Modified/)).toBeVisible();
  });

  test('should show document analysis status', async ({ page }) => {
    // Mock documents with different analysis states
    await page.route('/api/projects/test-project-1/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [
            {
              id: 'doc-1',
              project_id: 'test-project-1',
              drive_file_id: 'analyzed-file',
              file_name: 'Analyzed Document.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              last_analyzed: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
            {
              id: 'doc-2',
              project_id: 'test-project-1',
              drive_file_id: 'unanalyzed-file',
              file_name: 'Unanalyzed Document.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              last_analyzed: null,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Should show different analysis states
    await expect(page.getByText('Analyzed')).toBeVisible();
    await expect(page.getByText('Never analyzed')).toBeVisible();
  });

  test('should handle document linking errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('/api/projects/test-project-1/documents', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Failed to link documents',
          }),
        });
      }
    });

    await page.goto('/projects/test-project-1');
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Click link documents button
    await page.getByRole('button', { name: 'Link Documents' }).click();

    // Should show error message
    await expect(page.getByText('Failed to link documents')).toBeVisible();
  });

  test('should show empty state when no documents are linked', async ({ page }) => {
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
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Should show empty state
    await expect(page.getByText('No documents linked yet')).toBeVisible();
    await expect(page.getByText('Link documents from Google Drive to get started')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link Your First Document' })).toBeVisible();
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/projects/test-project-1');

    // Navigate to documents tab
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Should display mobile-friendly layout
    await expect(page.getByText('Existing Document.pdf')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link Documents' })).toBeVisible();

    // Mobile actions should work
    await page.getByRole('button', { name: 'Link Documents' }).click();
    await expect(page.getByText('Linking documents')).toBeVisible();
  });

  test('should handle large numbers of documents efficiently', async ({ page }) => {
    // Mock many documents
    const manyDocuments = Array.from({ length: 50 }, (_, i) => ({
      id: `doc-${i + 1}`,
      project_id: 'test-project-1',
      drive_file_id: `file-${i + 1}`,
      file_name: `Document ${i + 1}.pdf`,
      file_type: 'pdf',
      mime_type: 'application/pdf',
      file_size: Math.floor(Math.random() * 5000000),
      last_analyzed: i % 3 === 0 ? new Date().toISOString() : null,
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
    await page.getByRole('tab', { name: 'Documents' }).click();

    // Should render many documents efficiently
    await expect(page.getByText('Document 1.pdf')).toBeVisible();
    await expect(page.getByText('Document 50.pdf')).toBeVisible();

    // Should show document count
    await expect(page.getByText('50 documents')).toBeVisible();
  });
});