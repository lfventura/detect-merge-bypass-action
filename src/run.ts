import * as core from '@actions/core';
import * as github from '@actions/github';

export async function run(): Promise<void> {
  try {
    const token: string = core.getInput('github_token');
    const octokit: ReturnType<typeof github.getOctokit> = github.getOctokit(token);

    const repo: string = core.getInput('repo');
    const owner: string = core.getInput('owner');
    const sha: string = core.getInput('sha');

    const failOnBypass: boolean = core.getInput('fail_on_bypass_detected') === 'true';

    let mergeBypassDetected = false;
    // Get all required checks for the branch
    core.info('Fetching branch rules...');
    const branchRules = await octokit.request(`GET /repos/${owner}/${repo}/rules/branches/main`, {
      owner,
      repo,
    });
  
    interface BranchRule {
      type: string;
      parameters: {
        required_status_checks: { context: string }[];
        required_approving_review_count: { required_approving_review_count: number };
      };
    }

    const requiredChecks = (branchRules.data as BranchRule[])
      .filter((rule: BranchRule) => rule.type === 'required_status_checks')
      .flatMap((rule: BranchRule) => rule.parameters.required_status_checks.map((check: { context: string }) => check.context));
    const requiredChecksFound = requiredChecks.length > 0;

    if (requiredChecksFound) {
      core.info(`Required checks for the branch:${requiredChecks.map(check => `\n -> ${check}`).join('')}`);
    }

    // Get Commit Data
    const commitData = await octokit.request(`GET /repos/${owner}/${repo}/commits/${sha}`, {
      owner,
      repo,
      ref: sha,
    });

    const commitAuthor = commitData.data.author?.login || commitData.data.committer?.login || 'unknown';

    // Get the PR number associated with the commit
    core.info('Fetching PR associated with the commit...');
    const prData = await octokit.request(`GET /repos/${owner}/${repo}/commits/${sha}/pulls`, {
      owner,
      repo,
      commit_sha: sha,
    });

    const prFound: boolean = prData.data.length > 0;

    if (prFound) {
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

      console.log(requiredChecksFound);
      if ( requiredChecksFound ) {
        // Get the PR checks status
        core.info('Fetching PR checks...');
        const prChecks = await octokit.request(`GET /repos/${owner}/${repo}/commits/${latestSha}/check-runs`, {
          owner,
          repo,
          ref: sha,
        });

        const latestChecks = prChecks.data.check_runs.reduce((acc: Record<string, typeof prChecks.data.check_runs[0]>, check: typeof prChecks.data.check_runs[0]) => {
          // core.info(`Check Name: ${check.name}`);
          if (!acc[check.name] || acc[check.name].check_suite.id < check.check_suite.id) {
            acc[check.name] = check;
          }
          return acc;
        }, {} as Record<string, typeof prChecks.data.check_runs[0]>);

        // Verify if all required checks passed
        for (const check of requiredChecks) {
          const checkState = latestChecks[check]?.conclusion;
          if (!checkState || checkState !== 'success') {
            core.warning(` -> Required ${check} check did not pass (state: ${checkState}).`);
            mergeBypassDetected=true;
          }
          else {
            core.info(` -> Required ${check} check passed (state: ${checkState}).`);
          }
        }
      }
      else {
        core.info('No required checks configured for the branch.');
      }

      const requiredReviews = (
        (branchRules.data as BranchRule[])
          .find((rule: BranchRule) => rule.type === 'pull_request')
          ?.parameters.required_approving_review_count ?? 0
        ) as number;

      console.log(`Required reviews: ${requiredReviews}`);
      if ( requiredReviews > 0) {        
        const prReviews = await octokit.request(`GET /repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
          owner,
          repo,
          pull_number: prNumber,
        });
        const approvedReviews = prReviews.data.filter((review: { state: string }) => review.state === 'APPROVED');

        if (approvedReviews.length >= requiredReviews) {
          core.info(`PR has ${approvedReviews.length} approved reviews.`);
          console.log("oi");
        } else {
          core.warning('No approved reviews found for the PR.');
          console.log(`Required reviews: ${requiredReviews}, Approved reviews: ${approvedReviews.length}`);
          mergeBypassDetected = true;
        }
      }
    }
    else {
       core.warning('No PR associated with this push.');
       mergeBypassDetected = true;
    }

    core.info('Setting outputs...');
    core.info(`merge_bypass_detected: ${mergeBypassDetected}`);
    core.info(`commit_actor: ${commitAuthor}`);
    core.info(`commit_from_pr: ${prFound}`);
    core.setOutput('merge_bypass_detected', mergeBypassDetected);
    core.setOutput('commit_actor', commitAuthor || 'unknown');
    core.setOutput('commit_from_pr', prFound);

    if (mergeBypassDetected) {
      if (failOnBypass) {
        core.setFailed('Merge bypass detected.');
      }
      else {
        core.warning('Merge bypass detected.');
      }
    }
    if (!mergeBypassDetected) {
      core.info('No merge bypass detected.');
    }

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}
