import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from './run';

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('run', () => {
    let mockOctokit: { request: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        mockOctokit = {
            request: jest.fn(),
        };

        (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);
        (core.getInput as jest.Mock).mockImplementation((name: string) => {
            const inputs: { [key: string]: string } = {
                github_token: 'test-token',
                repo: 'test-repo',
                owner: 'test-owner',
                sha: 'test-sha',
            };
            return inputs[name];
        });
    });

    it('should detect no required checks and no PR, set merge_bypass_detected to true', async () => {
        mockOctokit.request
            .mockResolvedValueOnce({
                data: [
                    {
                        type: 'required_status_checks',
                        parameters: { required_status_checks: [] },
                    },
                ],
            })
            .mockResolvedValueOnce({
                data: {
                        author: {
                            login: 'test-user',
                        }                      
                },
            })
            .mockResolvedValueOnce({ data: [] });

        await run();

        expect(core.info).toHaveBeenCalledWith('Fetching branch rules...');
        expect(core.info).toHaveBeenCalledWith('Fetching PR associated with the commit...');
        expect(core.warning).toHaveBeenCalledWith('No PR associated with this push.');
        expect(core.setOutput).toHaveBeenCalledWith('merge_bypass_detected', true);
        expect(core.setOutput).toHaveBeenCalledWith('commit_actor', 'test-user');
        expect(core.setOutput).toHaveBeenCalledWith('commit_from_pr', false);
    });

    it('should detect no required checks but with PR, set merge_bypass_detected to false', async () => {
        mockOctokit.request
            .mockResolvedValueOnce({
                data: [
                    {
                        type: 'required_status_checks',
                        parameters: { required_status_checks: [] },
                    },
                ],
            })
            .mockResolvedValueOnce({
                data: {
                        author: {
                            login: 'test-user',
                        }                      
                },
            })
            .mockResolvedValueOnce({
                data: [{ number: 123 }],
            })
            .mockResolvedValueOnce({
                data: { head: { sha: 'latest-sha' } },
            });

        await run();

        expect(core.info).toHaveBeenCalledWith('Fetching branch rules...');
        expect(core.info).toHaveBeenCalledWith('Fetching PR associated with the commit...');
        expect(core.info).toHaveBeenCalledWith('No required checks configured for the branch.');
        expect(core.setOutput).toHaveBeenCalledWith('merge_bypass_detected', false);
        expect(core.setOutput).toHaveBeenCalledWith('commit_actor', 'test-user');
        expect(core.setOutput).toHaveBeenCalledWith('commit_from_pr', true);
    });

    it('should detect no PR associated with the commit and set merge_bypass_detected to true', async () => {
        mockOctokit.request
            .mockResolvedValueOnce({
                data: [
                    {
                        type: 'required_status_checks',
                        parameters: { required_status_checks: [{ context: 'test-check' }] },
                    },
                ],
            })
            .mockResolvedValueOnce({
                data: {
                        author: {
                            login: 'test-user',
                        }                      
                },
            })
            .mockResolvedValueOnce({ data: [] });

        await run();

        expect(core.info).toHaveBeenCalledWith('Fetching PR associated with the commit...');
        expect(core.warning).toHaveBeenCalledWith('No PR associated with this push.');
        expect(core.setOutput).toHaveBeenCalledWith('merge_bypass_detected', true);
        expect(core.setOutput).toHaveBeenCalledWith('commit_actor', 'test-user');
        expect(core.setOutput).toHaveBeenCalledWith('commit_from_pr', false);
    });

    it('should detect merge bypass when required checks do not pass', async () => {
        mockOctokit.request
            .mockResolvedValueOnce({
                data: [
                    {
                        type: 'required_status_checks',
                        parameters: { required_status_checks: [{ context: 'test-check' }] },
                    },
                ],
            })
            .mockResolvedValueOnce({
                data: {
                        author: {
                            login: 'test-user',
                        }                      
                },
            })
            .mockResolvedValueOnce({
                data: [{ number: 123 }],
            })
            .mockResolvedValueOnce({
                data: { head: { sha: 'latest-sha' } },
            })
            .mockResolvedValueOnce({
                data: {
                    check_runs: [
                        {
                            name: 'test-check',
                            conclusion: 'failure',
                            check_suite: { id: 1 },
                        },
                    ],
                },
            });

        await run();

        expect(core.warning).toHaveBeenCalledWith(' -> Required test-check check did not pass (state: failure).');
        expect(core.setOutput).toHaveBeenCalledWith('merge_bypass_detected', true);
        expect(core.setOutput).toHaveBeenCalledWith('commit_actor', 'test-user');
        expect(core.setOutput).toHaveBeenCalledWith('commit_from_pr', true);
    });

    it('should not detect merge bypass when all required checks pass', async () => {
        mockOctokit.request
            .mockResolvedValueOnce({
                data: [
                    {
                        type: 'required_status_checks',
                        parameters: { required_status_checks: [{ context: 'test-check' }] },
                    },
                    {
                        type: 'pull_request',
                        parameters: { required_approving_review_count: 1 },
                    }
                ],
            })
            .mockResolvedValueOnce({
                data: {
                        author: {
                            login: 'test-user',
                        }                      
                },
            })
            .mockResolvedValueOnce({
                data: [{ number: 123 }],
            })
            .mockResolvedValueOnce({
                data: { head: { sha: 'latest-sha' } },
            })
            .mockResolvedValueOnce({
                data: {
                    check_runs: [
                        {
                            name: 'test-check',
                            conclusion: 'success',
                            check_suite: { id: 1 },
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        state: 'APPROVED',
                    },
                    {
                        state: 'APPROVED',
                    },
                ],
            });

        await run();

        expect(core.info).toHaveBeenCalledWith('No merge bypass detected.');
        expect(core.setOutput).toHaveBeenCalledWith('merge_bypass_detected', false);
        expect(core.setOutput).toHaveBeenCalledWith('commit_actor', 'test-user');
        expect(core.setOutput).toHaveBeenCalledWith('commit_from_pr', true);
    });

    it('should detect merge bypass when all required checks pass but not sufficient approvals', async () => {
        mockOctokit.request
            .mockResolvedValueOnce({
                data: [
                    {
                        type: 'required_status_checks',
                        parameters: { required_status_checks: [{ context: 'test-check' }] },
                    },
                    {
                        type: 'pull_request',
                        parameters: { required_approving_review_count: 3 },
                    }
                ],
            })
            .mockResolvedValueOnce({
                data: {
                        author: {
                            login: 'test-user',
                        }                      
                },
            })
            .mockResolvedValueOnce({
                data: [{ number: 123 }],
            })
            .mockResolvedValueOnce({
                data: { head: { sha: 'latest-sha' } },
            })
            .mockResolvedValueOnce({
                data: {
                    check_runs: [
                        {
                            name: 'test-check',
                            conclusion: 'success',
                            check_suite: { id: 1 },
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        state: 'APPROVED',
                    },
                    {
                        state: 'APPROVED',
                    },
                ],
            });

        await run();

        expect(core.warning).toHaveBeenCalledWith('Merge bypass detected.');
        expect(core.setOutput).toHaveBeenCalledWith('merge_bypass_detected', true);
        expect(core.setOutput).toHaveBeenCalledWith('commit_actor', 'test-user');
        expect(core.setOutput).toHaveBeenCalledWith('commit_from_pr', true);
    });

    it('should detect merge bypass when no required checks pass and not sufficient approvals', async () => {
        mockOctokit.request
            .mockResolvedValueOnce({
                data: [
                    {
                        type: 'required_status_checks',
                        parameters: { required_status_checks: [{ context: 'test-check' }] },
                    },
                    {
                        type: 'pull_request',
                        parameters: { required_approving_review_count: 3 },
                    }
                ],
            })
            .mockResolvedValueOnce({
                data: {
                        author: {
                            login: 'test-user',
                        }                      
                },
            })
            .mockResolvedValueOnce({
                data: [{ number: 123 }],
            })
            .mockResolvedValueOnce({
                data: { head: { sha: 'latest-sha' } },
            })
            .mockResolvedValueOnce({
                data: {
                    check_runs: [
                        {
                            name: 'test-check',
                            conclusion: 'failure',
                            check_suite: { id: 1 },
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        state: 'APPROVED',
                    },
                    {
                        state: 'APPROVED',
                    },
                ],
            });

        await run();

        expect(core.warning).toHaveBeenCalledWith('Merge bypass detected.');
        expect(core.setOutput).toHaveBeenCalledWith('merge_bypass_detected', true);
        expect(core.setOutput).toHaveBeenCalledWith('commit_actor', 'test-user');
        expect(core.setOutput).toHaveBeenCalledWith('commit_from_pr', true);
    });

    it('should handle errors and fail the action', async () => {
        const errorMessage = 'Something went wrong';
        mockOctokit.request.mockRejectedValueOnce(new Error(errorMessage));

        await run();

        expect(core.setFailed).toHaveBeenCalledWith(errorMessage);
    });
});