# GitHub Upload Instructions

Follow these steps to upload your Albus project to GitHub:

## 1. Create a new repository on GitHub

1. Go to https://github.com/new to create a new repository
2. Name your repository (e.g., 'albus-web')
3. Choose if you want it to be public or private
4. Do NOT initialize with README, .gitignore, or license as we already have these files
5. Click 'Create repository'

## 2. Connect your local repository to GitHub

After creating the repository, GitHub will show commands to connect your local repository. Run these commands in your terminal:

```bash
git remote add origin https://github.com/YOUR-USERNAME/albus-web.git
git branch -M main
git push --set-upstream origin main
```

Note: If you see an error like "The current branch main has no upstream branch", use the command above with `--set-upstream` (which is the same as `-u` but more explicit).

Replace 'YOUR-USERNAME' with your actual GitHub username.

## 3. Verify your upload

After running these commands, your code will be uploaded to GitHub. You can verify by visiting:
https://github.com/YOUR-USERNAME/albus-web

## Note

Your local Git repository has already been initialized and your files have been committed with the message "Initial commit of Albus project". You only need to create the GitHub repository and push your code.