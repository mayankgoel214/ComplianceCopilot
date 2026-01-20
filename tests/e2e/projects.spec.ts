import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/test-users';

// Mock authentication state
test.describe('Projects Management Flow', () => {
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

    // Mock Firebase Auth state in localStorage
    await page.addInitScript(() => {
      // Mock Firebase auth state
      window.localStorage.setItem('firebase:authUser:mock-project-id:[DEFAULT]', JSON.stringify({
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
        accessToken: 'mock-access-token',
      }));
    });

    // Mock API responses for authenticated user
    await page.route('/api/projects', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            projects: [
              {
                id: 'test-project-1',
                name: 'Sample Compliance Project',
                description: 'A test project for FERPA compliance',
                status: 'draft',
                document_count: 3,
                framework_count: 2,
                latest_compliance_score: 75,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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
            project: {
              id: 'new-project-123',
              user_id: 'test-user-123',
              name: body.name,
              description: body.description || null,
              status: 'draft',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
    });
  });

  test('should display projects dashboard for authenticated user', async ({ page }) => {
    await page.goto('/');

    // Should show projects dashboard
    await expect(page.getByText('Your Projects')).toBeVisible();
    await expect(page.getByText('Sample Compliance Project')).toBeVisible();
    await expect(page.getByText('FERPA compliance')).toBeVisible();

    // Should show project statistics
    await expect(page.getByText('3 documents')).toBeVisible();
    await expect(page.getByText('2 frameworks')).toBeVisible();
    await expect(page.getByText('75% score')).toBeVisible();
  });

  test('should allow creating a new project', async ({ page }) => {
    await page.goto('/');

    // Click new project button
    await page.getByRole('button', { name: 'New Project' }).click();

    // Fill out project form
    await page.getByLabel('Project Name').fill('Test E2E Project');
    await page.getByLabel('Description').fill('This is a test project for E2E testing of HIPAA compliance requirements');

    // Submit form
    await page.getByRole('button', { name: 'Create Project' }).click();

    // Should show success notification
    await expect(page.getByText('Project created successfully')).toBeVisible();

    // Should navigate to project detail page
    await expect(page).toHaveURL(/\/projects\/new-project-123/);
    await expect(page.getByText('Test E2E Project')).toBeVisible();
  });

  test('should validate required fields in project creation', async ({ page }) => {
    await page.goto('/');

    // Click new project button
    await page.getByRole('button', { name: 'New Project' }).click();

    // Try to submit without name
    await page.getByRole('button', { name: 'Create Project' }).click();

    // Should show validation error
    await expect(page.getByText('Project name is required')).toBeVisible();
  });

  test('should navigate to project details', async ({ page }) => {
    await page.goto('/');

    // Click on existing project
    await page.getByText('Sample Compliance Project').click();

    // Should navigate to project detail page
    await expect(page).toHaveURL(/\/projects\/test-project-1/);
    await expect(page.getByText('Sample Compliance Project')).toBeVisible();
    await expect(page.getByText('FERPA compliance')).toBeVisible();
  });

  test('should show project tabs and navigation', async ({ page }) => {
    // Mock project detail API
    await page.route('/api/projects/test-project-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          project: {
            id: 'test-project-1',
            name: 'Sample Compliance Project',
            description: 'A test project for FERPA compliance',
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto('/projects/test-project-1');

    // Should show project tabs
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Documents' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Analysis' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Results' })).toBeVisible();

    // Default tab should be Overview
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  test('should handle project loading states', async ({ page }) => {
    // Mock slow API response
    await page.route('/api/projects', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.goto('/');

    // Should show loading skeleton
    await expect(page.getByTestId('projects-loading')).toBeVisible();
  });

  test('should handle empty projects state', async ({ page }) => {
    // Mock empty projects response
    await page.route('/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    await page.goto('/');

    // Should show empty state
    await expect(page.getByText('No projects yet')).toBeVisible();
    await expect(page.getByText('Create your first project to get started')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Your First Project' })).toBeVisible();
  });

  test('should display project status correctly', async ({ page }) => {
    // Mock projects with different statuses
    await page.route('/api/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            {
              id: 'draft-project',
              name: 'Draft Project',
              description: 'A draft project',
              status: 'draft',
              document_count: 0,
              framework_count: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'analyzing-project',
              name: 'Analyzing Project',
              description: 'Currently being analyzed',
              status: 'analyzing',
              document_count: 5,
              framework_count: 2,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'completed-project',
              name: 'Completed Project',
              description: 'Analysis completed',
              status: 'completed',
              document_count: 8,
              framework_count: 3,
              latest_compliance_score: 92,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto('/');

    // Should show different status indicators
    await expect(page.getByText('Draft')).toBeVisible();
    await expect(page.getByText('Analyzing')).toBeVisible();
    await expect(page.getByText('Completed')).toBeVisible();
    await expect(page.getByText('92% score')).toBeVisible();
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Should display mobile-friendly layout
    await expect(page.getByText('Your Projects')).toBeVisible();
    await expect(page.getByText('Sample Compliance Project')).toBeVisible();

    // Mobile navigation should work
    await page.getByText('Sample Compliance Project').click();
    await expect(page).toHaveURL(/\/projects\/test-project-1/);
  });
});