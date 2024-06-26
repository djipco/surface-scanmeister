module.exports = {
    "env": {
        "es2021": true,
        "node": true,
        "browser": true
    },
    "extends": "eslint:recommended",
    "overrides": [
        {
            "files": [
                ".eslintrc.{js,cjs}"
            ],
            "parserOptions": {
                "sourceType": "script"
            }
        }
    ],
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "rules": {
    }
}
