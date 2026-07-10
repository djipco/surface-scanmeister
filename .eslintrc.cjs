module.exports = {
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "overrides": [
        {
            "files": [
                "ScanMeister.js",
                "src/**/*.js",
                "config/**/*.js",
                "tools/*"
            ],
            "env": {
                "es2021": true,
                "node": true
            }
        },
        {
            "files": [
                "webclient/js/**/*.js"
            ],
            "env": {
                "es2021": true,
                "browser": true
            }
        },
        {
            "files": [
                ".eslintrc.{js,cjs}"
            ],
            "env": {
                "es2021": true,
                "node": true
            },
            "parserOptions": {
                "sourceType": "script"
            }
        }
    ],
    "rules": {
    }
}
