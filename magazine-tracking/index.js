const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();

// Cloud Function to increment magazine view count
exports.incrementView = functions.https.onCall(async (data, context) => {
  try {
    const {magazineName} = data;

    // Validate input
    if (!magazineName || typeof magazineName !== "string") {
      throw new functions.https.HttpsError(
          "invalid-argument", "Magazine name is required");
    }

    // Get reference to the magazine document
    const magazineRef = db.collection("magazines").doc(magazineName);

    // Use transaction to safely increment the view count
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(magazineRef);

      if (!doc.exists) {
        // Create new document if it doesn't exist
        transaction.set(magazineRef, {
          views: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return 1;
      } else {
        // Increment existing view count
        const currentViews = doc.data().views || 0;
        transaction.update(magazineRef, {
          views: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return currentViews + 1;
      }
    });

    console.log(`Incremented view count for ${magazineName} to ${result}`);

    return {
      success: true,
      magazineName: magazineName,
      newViewCount: result,
    };
  } catch (error) {
    console.error("Error incrementing view count:", error);
    throw new functions.https.HttpsError(
        "internal", "Failed to increment view count");
  }
});

// Cloud Function to get all magazine view counts
exports.getViewCounts = functions.https.onCall(async (data, context) => {
  try {
    const magazinesSnapshot = await db.collection("magazines").get();
    const viewCounts = {};

    magazinesSnapshot.forEach((doc) => {
      const data = doc.data();
      viewCounts[doc.id] = data.views || 0;
    });

    return {
      success: true,
      viewCounts: viewCounts,
    };
  } catch (error) {
    console.error("Error getting view counts:", error);
    throw new functions.https.HttpsError(
        "internal", "Failed to get view counts");
  }
});
