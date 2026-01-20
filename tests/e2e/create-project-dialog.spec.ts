import { test, expect } from '@playwright/test';

// Mock authentication state - directly copied from working projects.spec.ts
test.describe('Create Project Dialog', () => {
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
            projects: [],
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
              use_case: body.use_case || null,
              status: 'draft',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
    });

    // Navigate to the home page
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should open dialog when Create Project button is clicked', async ({ page }) => {
    // Click the Create Project button
    await page.click('button:has-text("Create Project")');

    // Wait for dialog to appear
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Check dialog title
    await expect(page.locator('text=Select Your Use Case')).toBeVisible();
  });

  test('should have correct dialog dimensions (90% viewport)', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Get viewport size
    const viewportSize = page.viewportSize();

    // Get dialog bounding box
    const dialogBox = await dialog.boundingBox();

    if (viewportSize && dialogBox) {
      // Check that dialog is approximately 90% of viewport
      const widthRatio = dialogBox.width / viewportSize.width;
      const heightRatio = dialogBox.height / viewportSize.height;

      expect(widthRatio).toBeGreaterThan(0.85);
      expect(widthRatio).toBeLessThan(0.95);
      expect(heightRatio).toBeGreaterThan(0.85);
      expect(heightRatio).toBeLessThan(0.95);
    }
  });

  test('should display all 6 use case cards', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Wait for dialog and cards to load
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Check for all use case cards
    const expectedUseCases = [
      'Research Labs',
      'Student Organization',
      'University Course Project',
      'University Administration',
      'Startup',
      'Other'
    ];

    for (const useCase of expectedUseCases) {
      await expect(page.locator(`text=${useCase}`)).toBeVisible();
    }

    // Count total number of cards
    const cards = page.locator('.use-case-card');
    await expect(cards).toHaveCount(6);
  });

  test('should allow card selection', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Click on Research Labs card
    const researchCard = page.locator('text=Research Labs').locator('..');
    await researchCard.click();

    // Check that card appears selected (has ring or selected class)
    await expect(researchCard).toHaveClass(/ring-2|selected/);

    // Check that continue button becomes enabled
    const continueButton = page.locator('button:has-text("Continue")');
    await expect(continueButton).toBeEnabled();
  });

  test('should handle Other option with secondary dialog', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Click on Other card
    await page.click('text=Other');

    // Should open secondary dialog for custom project description
    await expect(page.locator('text=Describe Your Project')).toBeVisible();

    // Fill in project details
    await page.fill('input[placeholder*="project title"]', 'Custom Test Project');
    await page.fill('textarea[placeholder*="describe"]', 'This is a test project for custom compliance requirements that need detailed analysis.');

    // Submit custom project
    await page.click('button:has-text("Create Project")');

    // Should close dialogs and create project
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Tab through the cards
    await page.keyboard.press('Tab'); // Close button
    await page.keyboard.press('Tab'); // First card

    // Use Enter to select
    await page.keyboard.press('Enter');

    // Check that first card is selected
    const firstCard = page.locator('.use-case-card').first();
    await expect(firstCard).toHaveClass(/ring-2|selected/);

    // Test Escape to close
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should close dialog with close button', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Click close button (X)
    await page.click('button[aria-label="Close dialog"]');

    // Dialog should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should close dialog with cancel button', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Click cancel button
    await page.click('button:has-text("Cancel")');

    // Dialog should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should disable continue button when no selection', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Continue button should be disabled initially
    const continueButton = page.locator('button:has-text("Continue")');
    await expect(continueButton).toBeDisabled();
  });

  test('should have proper spacing between cards', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    const cards = page.locator('.use-case-card');
    await expect(cards).toHaveCount(6);

    // Get positions of first two cards
    const firstCard = cards.nth(0);
    const secondCard = cards.nth(1);

    const firstBox = await firstCard.boundingBox();
    const secondBox = await secondCard.boundingBox();

    if (firstBox && secondBox) {
      // Cards should have adequate spacing (increased from 30px to 50px minimum)
      const gap = Math.abs(secondBox.x - (firstBox.x + firstBox.width));
      expect(gap).toBeGreaterThan(50); // Increased minimum spacing requirement
    }
  });

  test('should be responsive on different viewport sizes', async ({ page }) => {
    // Test desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.click('button:has-text("Create Project")');

    let cards = page.locator('.use-case-card');
    await expect(cards).toHaveCount(6);

    // Close dialog
    await page.keyboard.press('Escape');

    // Test tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.click('button:has-text("Create Project")');

    cards = page.locator('.use-case-card');
    await expect(cards).toHaveCount(6);

    // Close dialog
    await page.keyboard.press('Escape');

    // Test mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.click('button:has-text("Create Project")');

    cards = page.locator('.use-case-card');
    await expect(cards).toHaveCount(6);
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Check dialog has proper ARIA attributes
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Check cards have proper button role and tabindex
    const cards = page.locator('.use-case-card');

    for (let i = 0; i < 6; i++) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute('role', 'button');
      await expect(card).toHaveAttribute('tabindex', '0');
    }

    // Check close button has proper aria-label
    const closeButton = page.locator('button[aria-label="Close dialog"]');
    await expect(closeButton).toBeVisible();
  });

  test('should show selection indicator when card is selected', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    // Click on a card
    const startupCard = page.locator('text=Startup').locator('..');
    await startupCard.click();

    // Should show checkmark or selection indicator
    const selectionIndicator = page.locator('.absolute.top-3.right-3');
    await expect(selectionIndicator).toBeVisible();

    // Selection indicator should contain CheckCircle icon
    await expect(selectionIndicator.locator('svg')).toBeVisible();
  });

  test('should handle card hover effects', async ({ page }) => {
    await page.click('button:has-text("Create Project")');

    const card = page.locator('.use-case-card').first();

    // Hover over card
    await card.hover();

    // Card should have hover effects (shadow, transform, etc.)
    // We can't directly test CSS transforms, but we can verify the card is interactive
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/hover:shadow-lg/);
  });
});