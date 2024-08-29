# Setup guide

Refer to this link for more information: https://firebase.google.com/docs/functions/get-started?gen=2nd

> Note: To deploy, your Firebase project must be on the [Blaze pricing plan](https://firebase.google.com/pricing).

## 1. Create a Firebase Project
Add project in the Firebase console. Ignore if you already created

## 2. Set up your environment and the Firebase CLI
### 2.1 Install Node.js environment
You'll need a Node.js environment to write functions. Refer: https://nodejs.org/en/download/package-manager
### 2.2 Install Firebase CLI
You'll need the Firebase CLI to deploy functions to the Cloud Functions runtime. Refer: https://firebase.google.com/docs/cli#setup_update_cli

## 3. Initialize your project
### 3.1 Login to your Firebase
Run this command to log in via the browser and authenticate the Firebase CLI.
```
firebase login
```
### 3.2 Go to your Firebase project directory
Run this command to pull the source code and go to your Firebase project directory
```
git clone https://github.com/inspireui/firebase-notification-realtime-chat
cd firebase-notification-realtime-chat
```
### 3.3 Initialize project
Run these commands
```
firebase use <project-id>
firebase init functions
```

You may have to answer some questions, just follow the form below
- Would you like to initialize a new codebase, or overwrite an existing one? <mark>Overwrite</mark>
- What language would you like to use to write Cloud Functions? <mark>JavaScript</mark>
- Do you want to use ESLint to catch probable bugs and enforce style? <mark>No</mark>
- File functions/package.json already exists. Overwrite? <mark>No</mark>
- File functions/index.js already exists. Overwrite? <mark>No</mark>
- File functions/.gitignore already exists. Overwrite? <mark>No</mark>
- Do you want to install dependencies with npm now? <mark>No</mark>

<details>
  <summary markdown="span">The result will look like that</summary>
  
```sh
son@MacBook-Pro-cua-Son firebase-notification-realtime-chat % firebase init functions                     

     ######## #### ########  ######## ########     ###     ######  ########
     ##        ##  ##     ## ##       ##     ##  ##   ##  ##       ##
     ######    ##  ########  ######   ########  #########  ######  ######
     ##        ##  ##    ##  ##       ##     ## ##     ##       ## ##
     ##       #### ##     ## ######## ########  ##     ##  ######  ########

You're about to initialize a Firebase project in this directory:

  /Users/son/Desktop/firebase-notification-realtime-chat

Before we get started, keep in mind:

  * You are initializing within an existing Firebase project directory


=== Project Setup

First, let's associate this project directory with a Firebase project.
You can create multiple project aliases by running firebase use --add, 
but for now we'll just set up a default project.

i  Using project flutter-practice-001 (Flutter Paractice test)

=== Functions Setup

Detected existing codebase(s): default

? Would you like to initialize a new codebase, or overwrite an existing one? Overwrite

Overwriting codebase default...

? What language would you like to use to write Cloud Functions? JavaScript
? Do you want to use ESLint to catch probable bugs and enforce style? No
? File functions/package.json already exists. Overwrite? No
i  Skipping write of functions/package.json
? File functions/index.js already exists. Overwrite? No
i  Skipping write of functions/index.js
? File functions/.gitignore already exists. Overwrite? No
i  Skipping write of functions/.gitignore
? Do you want to install dependencies with npm now? No

i  Writing configuration info to firebase.json...
i  Writing project information to .firebaserc...

✔  Firebase initialization complete!
```
</details>

## 4. Deploy the function
Deploy functions to a production environment
Run this command to deploy
```
firebase deploy --only functions
```