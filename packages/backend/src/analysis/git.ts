import simpleGit from 'simple-git';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), 'data', 'projects');

export function getProjectPath(projectName: string): string {
  return path.join(PROJECTS_DIR, projectName);
}

/**
 * Clone a git repository. Injects token for authentication if provided.
 * After clone, resets remote URL to strip token from git config.
 */
export async function cloneRepo(
  gitUrl: string,
  projectName: string,
  token: string | null
): Promise<{ localPath: string; defaultBranch: string }> {
  const localPath = getProjectPath(projectName);

  // Remove leftover directory from previous failed attempts
  await rm(localPath, { recursive: true, force: true });
  await mkdir(path.dirname(localPath), { recursive: true });

  const authUrl = token ? injectToken(gitUrl, token) : gitUrl;
  const git = simpleGit();
  await git.clone(authUrl, localPath);

  // Strip token from stored remote URL
  const repoGit = simpleGit(localPath);
  await repoGit.remote(['set-url', 'origin', gitUrl]);

  const branchSummary = await repoGit.branch();
  const defaultBranch = branchSummary.current || 'main';

  return { localPath, defaultBranch };
}

/**
 * Pull latest changes from remote.
 * Temporarily sets auth URL, pulls, then resets to clean URL.
 */
export async function pullRepo(localPath: string, token: string | null, gitUrl: string): Promise<void> {
  const git = simpleGit(localPath);

  if (token) {
    const authUrl = injectToken(gitUrl, token);
    await git.remote(['set-url', 'origin', authUrl]);
  }

  try {
    await git.pull();
  } finally {
    // Always reset to clean URL (strip token)
    await git.remote(['set-url', 'origin', gitUrl]);
  }
}

/**
 * Remove a cloned repository from disk.
 */
export async function removeRepo(projectName: string): Promise<void> {
  const localPath = getProjectPath(projectName);
  await rm(localPath, { recursive: true, force: true });
}

function injectToken(url: string, token: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = 'oauth2';
    parsed.password = token;
    return parsed.toString();
  } catch {
    return url.replace('https://', `https://oauth2:${token}@`);
  }
}
