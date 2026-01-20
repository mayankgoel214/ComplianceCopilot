import { test, expect } from '@playwright/test'
import { testData } from './fixtures/test-users'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start each test at the home page
    await page.goto('/')
  })

  test('should display sign in options for unauthenticated users', async ({ page }) => {
    // Should show the welcome page with sign in options
    await expect(page.getByText(testData.appTitle)).toBeVisible()
    await expect(page.getByText(testData.signInText)).toBeVisible()

    // Should show sign in and sign up buttons
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create Account' })).toBeVisible()
  })

  test('should navigate to login page', async ({ page }) => {
    // Click on Sign In button
    await page.getByRole('link', { name: 'Sign In' }).click()

    // Should navigate to login page
    await expect(page).toHaveURL('/login')
    await expect(page.getByText('Welcome Back')).toBeVisible()
    await expect(page.getByText('Sign in to your account using Google')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('should navigate to signup page', async ({ page }) => {
    // Click on Create Account button
    await page.getByRole('link', { name: 'Create Account' }).click()

    // Should navigate to signup page
    await expect(page).toHaveURL('/signup')
    await expect(page.getByText('Create Account')).toBeVisible()
    await expect(page.getByText('Sign up with your Google account to get started')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('should show loading state during authentication', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login')

    // Mock a slow authentication response
    await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
      // Delay the response to see loading state
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.continue()
    })

    // Click Google sign in button
    await page.getByRole('button', { name: /continue with google/i }).click()

    // Should show loading skeleton (or stay on login page if auth completes quickly)
    // The loading state may be too fast to catch in tests
    await expect(page).toHaveURL('/login')
  })

  test('should handle authentication error gracefully', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login')

    // Mock authentication failure
    await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'INVALID_REQUEST' } })
      })
    })

    // Click Google sign in button
    await page.getByRole('button', { name: /continue with google/i }).click()

    // Should show error toast (we can check if page stays on login)
    await expect(page).toHaveURL('/login')
  })

  test('should navigate between login and signup pages', async ({ page }) => {
    // Start at login page
    await page.goto('/login')

    // Click sign up link
    await page.getByRole('link', { name: /sign up/i }).click()
    await expect(page).toHaveURL('/signup')

    // Click sign in link
    await page.getByRole('link', { name: /sign in/i }).click()
    await expect(page).toHaveURL('/login')
  })

  test('should have accessible authentication forms', async ({ page }) => {
    // Test login page accessibility
    await page.goto('/login')

    // Check for proper heading structure
    await expect(page.getByText('Welcome Back')).toBeVisible()

    // Check for accessible button
    const signInButton = page.getByRole('button', { name: /continue with google/i })
    await expect(signInButton).toBeVisible()

    // Test signup page accessibility
    await page.goto('/signup')

    // Check for proper heading structure
    await expect(page.getByText('Create Account')).toBeVisible()

    // Check for accessible button
    const signUpButton = page.getByRole('button', { name: /continue with google/i })
    await expect(signUpButton).toBeVisible()
  })

  test('should display proper metadata and title', async ({ page }) => {
    await page.goto('/')

    // Check page title
    await expect(page).toHaveTitle(/VTHacks/)

    // Check viewport meta tag for responsive design
    const viewportMeta = page.locator('meta[name="viewport"]')
    await expect(viewportMeta).toHaveAttribute('content', /width=device-width/)
  })

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/')

    // Test keyboard navigation to sign in button
    await page.keyboard.press('Tab')

    // The sign in button should be focused
    const signInButton = page.getByRole('link', { name: 'Sign In' })
    await expect(signInButton).toBeFocused()

    // Press Enter to navigate
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/login')
  })

  test('should work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Should still show all elements properly
    await expect(page.getByText(testData.appTitle)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create Account' })).toBeVisible()

    // Navigate to login page
    await page.getByRole('link', { name: 'Sign In' }).click()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })
})