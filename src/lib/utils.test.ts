import { cn } from './utils'

describe('cn utility function', () => {
  it('should merge class names correctly', () => {
    const result = cn('px-4', 'py-2', 'bg-blue-500')
    expect(result).toBe('px-4 py-2 bg-blue-500')
  })

  it('should handle conditional classes', () => {
    const isActive = true
    const result = cn('base-class', isActive && 'active-class')
    expect(result).toBe('base-class active-class')
  })

  it('should filter out falsy values', () => {
    const result = cn('base-class', false && 'hidden', null, undefined, 'visible')
    expect(result).toBe('base-class visible')
  })

  it('should handle Tailwind class conflicts with twMerge', () => {
    const result = cn('px-4 px-6')
    expect(result).toBe('px-6') // twMerge should keep the last px class
  })

  it('should handle complex class merging', () => {
    const result = cn(
      'bg-red-500 text-white px-4',
      'bg-blue-500 py-2', // bg-blue-500 should override bg-red-500
      'hover:bg-green-500'
    )
    expect(result).toBe('text-white px-4 bg-blue-500 py-2 hover:bg-green-500')
  })

  it('should handle arrays of classes', () => {
    const result = cn(['px-4', 'py-2'], 'bg-blue-500')
    expect(result).toBe('px-4 py-2 bg-blue-500')
  })

  it('should handle object notation', () => {
    const result = cn({
      'px-4': true,
      'py-2': true,
      'bg-red-500': false,
      'bg-blue-500': true,
    })
    expect(result).toBe('px-4 py-2 bg-blue-500')
  })

  it('should handle empty input', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('should handle only falsy values', () => {
    const result = cn(false, null, undefined, '')
    expect(result).toBe('')
  })

  it('should handle nested arrays and objects', () => {
    const result = cn(
      ['px-4', { 'py-2': true, 'py-4': false }],
      'bg-blue-500',
      [false, 'text-white']
    )
    expect(result).toBe('px-4 py-2 bg-blue-500 text-white')
  })

  it('should resolve Tailwind conflicts in complex scenarios', () => {
    const result = cn(
      'p-4 px-6', // p-4 sets padding on all sides, px-6 should override horizontal padding
      'py-8' // py-8 should override vertical padding from p-4
    )
    expect(result).toBe('p-4 px-6 py-8')
  })

  it('should handle responsive and state variants', () => {
    const result = cn(
      'text-sm md:text-lg',
      'hover:text-blue-500 focus:text-green-500',
      'dark:text-white'
    )
    expect(result).toBe('text-sm md:text-lg hover:text-blue-500 focus:text-green-500 dark:text-white')
  })
})