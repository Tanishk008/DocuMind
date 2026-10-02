require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

async function clearDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not found");
    process.exit(1);
  }
  
  const getDbUri = (dbName) => {
    const [base, query] = uri.split('?');
    const lastSlashIndex = base.lastIndexOf('/');
    const hostBase = base.substring(0, lastSlashIndex);
    return `${hostBase}/${dbName}${query ? `?${query}` : ''}`;
  };

  try {
    const authUri = getDbUri('documind_auth');
    const authConn = await mongoose.createConnection(authUri).asPromise();
    await authConn.dropDatabase();
    console.log("Dropped documind_auth");
    await authConn.close();

    const dataUri = getDbUri('documind_data');
    const dataConn = await mongoose.createConnection(dataUri).asPromise();
    await dataConn.dropDatabase();
    console.log("Dropped documind_data");
    await dataConn.close();

    console.log("All data cleared successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error clearing DB:", error);
    process.exit(1);
  }
}

clearDB();
