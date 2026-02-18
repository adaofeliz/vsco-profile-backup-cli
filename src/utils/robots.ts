/**
 * Robots.txt fetching and policy enforcement
 * Implements ethical scraping by respecting robots.txt rules
 */

export interface RobotsCheckResult {
  allowed: boolean;
  reason?: string;
  fetchSuccess: boolean;
}

/**
 * Fetch robots.txt from VSCO
 * Returns the robots.txt content or null if fetch fails
 */
export async function fetchRobotsTxt(): Promise<string | null> {
  try {
    const response = await fetch('https://vsco.co/robots.txt', {
      headers: {
        'User-Agent': 'vsco-profile-backup-cli/0.1.0',
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch (error) {
    // Network error, timeout, etc.
    return null;
  }
}

/**
 * Simple robots.txt parser
 * Checks if the given path is allowed for our user agent
 */
export function isCrawlAllowed(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split('\n');
  let relevantUserAgent = false;
  let allowed = true; // Default to allowed

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Check for User-agent directive
    if (trimmed.toLowerCase().startsWith('user-agent:')) {
      const agent = trimmed.substring('user-agent:'.length).trim().toLowerCase();
      // Match our bot or wildcard
      relevantUserAgent = agent === '*' || agent === 'vsco-profile-backup-cli';
      continue;
    }

    // Only process rules for relevant user agents
    if (!relevantUserAgent) {
      continue;
    }

    // Check Disallow directive
    if (trimmed.toLowerCase().startsWith('disallow:')) {
      const disallowPath = trimmed.substring('disallow:'.length).trim();
      
      // Empty disallow means everything is allowed
      if (disallowPath === '') {
        allowed = true;
        continue;
      }

      // Check if path matches disallow pattern
      if (path.startsWith(disallowPath)) {
        allowed = false;
      }
    }

    // Check Allow directive (overrides Disallow)
    if (trimmed.toLowerCase().startsWith('allow:')) {
      const allowPath = trimmed.substring('allow:'.length).trim();
      
      // Check if path matches allow pattern
      if (path.startsWith(allowPath)) {
        allowed = true;
      }
    }
  }

  return allowed;
}

/**
 * Check if crawling a VSCO profile is allowed according to robots.txt
 * Returns structured result with allowed status and reason
 */
export async function checkRobotsPolicy(username: string): Promise<RobotsCheckResult> {
  const profilePath = `/${username}`;
  
  // Try to fetch robots.txt
  const robotsTxt = await fetchRobotsTxt();

  // If fetch failed, warn but proceed with conservative approach
  if (robotsTxt === null) {
    return {
      allowed: true,
      reason: 'robots.txt fetch failed, proceeding with conservative throttling',
      fetchSuccess: false,
    };
  }

  // Check if crawling is allowed
  const allowed = isCrawlAllowed(robotsTxt, profilePath);

  return {
    allowed,
    reason: allowed
      ? 'robots.txt allows profile crawling'
      : 'robots.txt disallows profile crawling',
    fetchSuccess: true,
  };
}
