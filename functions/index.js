const functions = require('firebase-functions');

//The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.pushNotification = functions.https.onRequest((req, res) => {
    admin
        .firestore()
        .collection('users')
        .doc(req.query.email)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                res.status(400).json("Not Found")
            } else {
                const user = snapshot.data()
                const payload = {
                    notification: {
                        title: `You have a message from "${req.query.senderName}"`,
                        body: req.query.message,
                        badge: '1',
                        sound: 'default'
                    }
                }
                admin
                    .messaging()
                    .sendToDevice(user.deviceToken, payload)
                    .then(response => {
                        console.log('Successfully sent message:', response)
                        res.json({ success: true })
                    })
                    .catch(error => {
                        console.log('Error sending message:', error)
                        res.status(500).send(error);
                    })
            }

        })
        .catch((err) => {
            res.status(500).send(err);
        })
});

exports.sendNotification = functions.firestore
    .document('chatRooms/{roomId}/chatScreen/{message}')
    .onCreate((snap, context) => {
        const doc = snap.data()

        const { roomId } = context.params
        const { text, sender, receiver } = doc

        admin.firestore().doc(`chatRooms/${roomId}`).get().then(snapshot => {
            const room = snapshot.data()
            const { users } = room

            if (users instanceof Array) {
                users.forEach(user => {
                    const { email, pushToken, unread, langCode } = user
                    if (email === receiver) {
                        const payload = {
                            notification: {
                                title: `You have a message from "${sender}"`,
                                body: `${text}`,
                                badge: `${unread}`,
                                sound: 'default'
                            }
                        }
                        admin
                            .messaging()
                            .sendToDevice(pushToken, payload)
                            .then(response => {
                                console.log('Successfully sent message:', response)
                            })
                            .catch(error => {
                                console.log('Error sending message:', error)
                            })
                    }
                })
            }
        })
    })
