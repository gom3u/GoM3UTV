class GitHubSync {
    constructor() {
        this.user = localStorage.getItem('gh_user') || '';
        this.repo = localStorage.getItem('gh_repo') || '';
        this.token = localStorage.getItem('gh_token') || '';
    }

    isConfigured() {
        return this.user && this.repo && this.token;
    }

    async getSha(path) {
        const url = `https://api.github.com/repos/${this.user}/${this.repo}/contents/${path}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `token ${this.token}` }
        });
        if (res.ok) {
            const data = await res.json();
            return data.sha;
        }
        return null;
    }

    async updateFile(path, contentString, commitMessage) {
        if (!this.isConfigured()) throw new Error("GitHub credentials not configured!");

        const sha = await this.getSha(path);
        const url = `https://api.github.com/repos/${this.user}/${this.repo}/contents/${path}`;
        
        // Base64 encode file content safely
        const encodedContent = btoa(unescape(encodeURIComponent(contentString)));

        const body = {
            message: commitMessage,
            content: encodedContent,
            ...(sha && { sha })
        };

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to commit to GitHub.");
        }
        return await res.json();
    }
}
