/**
 * CLI argument parsing and validation types
 */

export interface CliOptions {
  outRoot: string;
  verbose: boolean;
  ignoreRobots: boolean;
  maxScrolls?: number;
  maxItems?: number;
  timeoutMs?: number;
  headful?: boolean;
}

export interface CliResult {
  username: string;
  profileUrlNormalized: string;
  backupRoot: string;
}

export interface CliError {
  code: string;
  message: string;
}
