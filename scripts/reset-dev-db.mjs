// Drops the database in MONGODB_URI. Development only.
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/whatsapp_bulk";
if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
await mongoose.connect(uri);
await mongoose.connection.dropDatabase();
console.log(`Dropped ${mongoose.connection.name}`);
await mongoose.disconnect();
