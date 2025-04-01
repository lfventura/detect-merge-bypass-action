# Detect Merge Bypass Action

![GitHub Actions](https://img.shields.io/github/actions/workflow/status/lfventura/detect-merge-bypass-action/main.yml?branch=main)
![License](https://img.shields.io/github/license/lfventura/detect-merge-bypass-action)

## Description

The **Detect Merge Bypass Action** is a GitHub Action designed to ensure that all required checks for a branch are properly enforced before merging. It identifies potential bypasses of required checks by analyzing the latest commit in a Pull Request (PR) and verifying its status.

## Features

- Fetches branch protection rules to identify required checks.
- Identifies the Pull Request associated with a specific commit.
- Verifies the status of required checks for the latest commit in the PR.
- Detects and warns about potential merge bypasses.

## Requirements

- **Node.js**: Version 20 or higher.
- **GitHub Token**: A token with read access to the repository.

## Inputs

| Name           | Description                                      | Required | Default |
|-----------------|--------------------------------------------------|----------|---------|
| `github_token` | GitHub token for authentication                  | Yes      | github.token     |
| `repo`         | Name of the repository                           | Yes      | github.repository_owner     |
| `owner`        | Owner of the repository                          | Yes      | github.event.repository.name     |
| `sha`          | SHA of the commit at main branch to be verified                 | Yes      | github.sha     |

## Outputs

| Name                   | Description                                      |
|-------------------------|--------------------------------------------------|
| `merge_bypass_detected` | `true` if a merge bypass is detected, otherwise `false`. |

## Usage

Add the following to your workflow file (e.g., `.github/workflows/main.yml`):

```yaml
name: Detect Merge Bypass

on:
  push:
    branches:
      - main

jobs:
  detect-merge-bypass:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Run Detect Merge Bypass Action
        uses: ./ # Path to your local action
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          repo: ${{ github.repository }}
          owner: ${{ github.repository_owner }}
          sha: ${{ github.sha }}
```

## Development

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/lfventura/detect-merge-bypass-action.git
cd detect-merge-bypass-action
npm install
```

### Linting

Check the code for linting issues:

```bash
npm run lint
```

Automatically fix linting issues:

```bash
npm run lintfix
```

### Build

Build the project for production:

```bash
npm run build
```

## How It Works

1. **Fetch Branch Rules**: The action retrieves branch protection rules to identify required checks.
2. **Identify PR**: It determines the Pull Request associated with the provided commit SHA.
3. **Fetch Latest SHA**: The action fetches the latest commit SHA from the PR.
4. **Verify Checks**: It verifies the status of all required checks for the latest commit.
5. **Detect Merge Bypass**: If any required check is missing or failed, it flags a potential merge bypass.

## License

This project is licensed under the [MIT License](LICENSE).