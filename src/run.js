import * as core from '@actions/core';
import * as github from '@actions/github';

export async function run() {
  try {
    const token = core.getInput('github_token');
    const octokit = github.getOctokit(token);
    const { context } = github;

    const repo = core.getInput('repo') || context.repo.repo;
    const owner = core.getInput('owner') || context.repo.owner;
    const sha = core.getInput('sha') || context.sha;

    // Get all required checks for the branch
    core.info('Fetching branch rules...');
    const branchRules = await octokit.request(`GET /repos/${owner}/${repo}/rules/branches/main`, {
      owner,
      repo,
    });

    const requiredChecks = branchRules.data
      .filter(rule => rule.type === 'required_status_checks')
      .flatMap(rule => rule.parameters.required_status_checks.map(check => check.context));

    if (requiredChecks.length === 0) {
      core.info('No required checks configured for the branch.');
      core.setOutput('merge_bypass_detected', 'false');
      return;
    }

    core.info(`Required checks for the branch:${requiredChecks.map(check => `\n -> ${check}`).join('')}`);

    // Get the PR number associated with the commit
    core.info('Fetching PR associated with the commit...');
    const prData = await octokit.request(`GET /repos/${owner}/${repo}/commits/${sha}/pulls`, {
      owner,
      repo,
      commit_sha: sha,
    });

    if (prData.data.length === 0) {
      core.info('No PR associated with this push.');
      core.setOutput('merge_bypass_detected', 'false');
      return;
    }

    const prNumber = prData.data[0].number;
    core.info(`PR Number: ${prNumber}`);

    // Fetch the latest SHA from the PR
    core.info('Fetching the latest commit SHA from the PR...');
    const prDetails = await octokit.request(`GET /repos/${owner}/${repo}/pulls/${prNumber}`, {
      owner,
      repo,
      pull_number: prNumber,
    });

    const latestSha = prDetails.data.head.sha;
    core.info(`Latest SHA from the PR: ${latestSha}`);

    // Get the PR checks status
    core.info('Fetching PR checks...');
    const prChecks = await octokit.request(`GET /repos/${owner}/${repo}/commits/${latestSha}/check-runs`, {
      owner,
      repo,
      ref: sha,
    });

    const latestChecks = prChecks.data.check_runs.reduce((acc, check) => {
      // core.info(`Check Name: ${check.name}`);
      if (!acc[check.name] || acc[check.name].check_suite.id < check.check_suite.id) {
        acc[check.name] = check;
      }
      return acc;
    }, {});

    // Verify if all required checks passed
    let merge_bypass_detected = false;
    for (const check of requiredChecks) {
      const checkState = latestChecks[check]?.conclusion;
      if (!checkState || checkState !== 'success') {
        core.error(` -> Required ${check} check did not pass (state: ${checkState}).`);
        merge_bypass_detected=true;
      }
      else {
        core.info(` -> Required ${check} check passed (state: ${checkState}).`);
      }
    }

    if (merge_bypass_detected) {
      core.warning('Merge bypass detected!');
    }
    else {
      core.info('No merge bypass detected.');
    }

    core.setOutput('merge_bypass_detected', merge_bypass_detected);
  } catch (error) {
    core.setFailed(error.message);
  }
}
