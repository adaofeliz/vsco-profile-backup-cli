import { jest } from '@jest/globals';

const setupSessionModule = async () => {
  jest.resetModules();

  const closePage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const closeContext = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const closeBrowser = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

  const mockPage = { close: closePage };
  const mockContext = {
    newPage: jest.fn<() => Promise<typeof mockPage>>().mockResolvedValue(mockPage),
    close: closeContext,
  };
  const mockBrowser = {
    newContext: jest.fn<() => Promise<typeof mockContext>>().mockResolvedValue(mockContext),
    close: closeBrowser,
  };

  const playwright = await import('playwright');
  const launchSpy = jest
    .spyOn(playwright.chromium, 'launch')
    .mockResolvedValue(mockBrowser as never);

  const { createVscoSession } = await import('./session');

  return {
    createVscoSession,
    launchSpy,
    mockBrowser,
    mockContext,
    mockPage,
    closeBrowser,
    closeContext,
    closePage,
  };
};

describe('createVscoSession', () => {
  it('creates a session and closes resources once', async () => {
    const { createVscoSession, launchSpy, mockBrowser, closeBrowser, closeContext, closePage } =
      await setupSessionModule();

    const session = await createVscoSession({ headless: false, userAgent: 'Agent' });

    expect(launchSpy).toHaveBeenCalledWith({ headless: false });
    expect(mockBrowser.newContext).toHaveBeenCalledWith({ userAgent: 'Agent' });

    await session.close();
    await session.close();

    expect(closePage).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });

  it('closes browser on setup failure', async () => {
    const { createVscoSession, mockContext, closeBrowser, closeContext } =
      await setupSessionModule();

    mockContext.newPage.mockRejectedValueOnce(new Error('boom'));

    await expect(createVscoSession()).rejects.toThrow('boom');

    expect(closeContext).toHaveBeenCalledTimes(1);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });
});
