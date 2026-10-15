/**
 * Run against the real Medusa process, like the Didar HTTP suite.
 * Mercur 2.3.7 patches Node's module loader; Jest's in-process require cache
 * falsely reports .d.ts patch targets as loaded and tries to execute them.
 * An actual server preserves the production module-loader and patch behavior.
 */
describe('Medusa health (real process)', () => {
  it('responds successfully from the running API', async () => {
    const response = await fetch(`${process.env.TEST_API_URL || 'http://localhost:9000'}/health`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')
  })
})
