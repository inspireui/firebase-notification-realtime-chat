firebase login
# firebase init firestore
# firebase init functions
if [ ! -f functions/.env ]; then
	echo "No functions/.env found. Firebase Cloud Messaging will be used by default."
fi
cd functions
npm install
# npm install --save firebase-functions@latest
cd ..
firebase deploy --only functions

# firebase init emulators
# firebase emulators:start