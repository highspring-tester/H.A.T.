Highspring Portal: Step-by-Step Setup Guide

This guide will walk you through every step to get your Node.js application running locally and deployed to Render.

Part 1: Local Setup

Step 1. Create Your Project Files

Create the 6 files listed above (package.json, .gitignore, server.js, migrate.js, .env.example, README.md) and copy their contents.

Step 2. Install Dependencies

Open your terminal in the project folder and run:

npm install


This will read your package.json and install all the necessary packages (like Express, Mongoose, etc.) into a node_modules folder.

Step 3. Set Up Environment Variables

This is the most important step for connecting your app to its services.

Create a new file named .env in the same directory.

Copy the contents of .env.example into your new .env file.

Fill in the blank values:

JWT_SECRET: Create a long, random, secret string. You can use a password generator.

Example: my-super-secret-key-for-jwt-12345!

MONGODB_URI:

Go to MongoDB Atlas and create a free cluster.

In your cluster, go to Database Access and create a user (e.g., highspring-user) with a secure password.

Go to Network Access and add your current IP address (or 0.0.0.0/0 for access from anywhere, not recommended for production).

Go back to your cluster Overview and click Connect.

Choose "Drivers" (or "Connect your application").

Copy the Connection String (it starts with mongodb+srv://).

Replace <username>, <password>, and <databaseName> in the string.

Example: mongodb+srv://highspring-user:mySecurePassword123@my-cluster.abc12.mongodb.net/highspring-db?retryWrites=true&w=majority

GOOGLE_SHEET_ID: Open your Google Sheet. The ID is in the URL:
https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit

GOOGLE_SERVICE_ACCOUNT_EMAIL & GOOGLE_PRIVATE_KEY:

Go to the Google Cloud Console and select your project.

Go to IAM & Admin -> Service Accounts.

Create a new service account (e.g., sheets-migrator).

Grant it the "Google Sheets API" role (or "Editor" for simplicity).

After creating it, go to the Keys tab for that service account.

Click Add Key -> Create new key -> JSON.

A JSON file will download. Treat this file like a password.

Open the JSON file.

Copy the client_email value into GOOGLE_SERVICE_ACCOUNT_EMAIL in your .env.

Copy the entire private_key value (from -----BEGIN... to ...END...) into GOOGLE_PRIVATE_KEY. Remember to wrap it in quotes ("...") and replace all newlines with \n as shown in .env.example.

Finally, share your Google Sheet with the client_email address, just like you would share it with a person.

Step 4. Run the Data Migration (Optional)

If you have data in your Google Sheet, this script will move it to your MongoDB database.

Make sure your .env is fully set up first.

Run the script in your terminal:

npm run migrate


You should see console messages logging the progress.

Step 5. Run Your Server Locally

You're ready to start the server!

npm start


Your server is now running. You can visit http://localhost:8080/api/health in your browser to check if it's working.

Part 2: Deployment to Render (with Git)

Step 1. Initialize Git Repository

If you haven't already, set up your project with Git.

# Initialize a new Git repository
git init

# Add all your files (thanks to .gitignore, node_modules and .env will be skipped)
git add .

# Make your first commit
git commit -m "Initial project setup"


Step 2. Create a GitHub/GitLab Repository

Go to GitHub or GitLab and create a new, empty repository (e.g., highspring-backend).

Copy the commands to "push an existing repository from the command line." They will look like this:

git remote add origin <your-repository-url.git>
git branch -M main
git push -u origin main


Run those commands in your terminal. Your code is now on GitHub/GitLab.

Step 3. Deploy on Render

Log in to your Render Dashboard.

Click New + -> Web Service.

Connect your GitHub/GitLab account and choose the repository you just pushed.

Render will auto-detect it's a Node project. Configure the settings:

Build Command: npm install

Start Command: npm start

Runtime: Node (select the latest stable version)

Add Environment Variables: This is the most important part.

Go to the Environment tab.

Click Add Environment Variable (or "Add Secret File").

DO NOT upload your .env file. You must add each variable one by one.

Add all the keys and values from your local .env file (e.g., JWT_SECRET, MONGODB_URI, GOOGLE_SHEET_ID, etc.).

For GOOGLE_PRIVATE_KEY: This multi-line key is tricky.

Easy Way: Add it as a normal environment variable. Copy the entire value from your .env file, including the quotes and \n characters, and paste it into the "Value" field in Render.

Better Way (Secret File): Click Add Secret File.

Filename: google-key.json

Contents: Paste the original contents of the JSON key file you downloaded from Google Cloud.

You would then have to modify migrate.js to read this file, which is more complex. Try the easy way first.

Click Create Web Service.

Render will now pull your code, run npm install, and then npm start. Your API will be live at the .onrender.com URL provided.