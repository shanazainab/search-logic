const express = require("express");

const searchRoutes = require("./routes/search");
const sequelize = require("./util/database");

const Building = require("./models/building");
const Property = require("./models/property");
const Reservation = require("./models/reservation");
const Availability = require("./models/availability");

const app = express();
app.use(express.json());

app.use(searchRoutes);

Building.hasMany(Property, {
    foreignKey: "building_id",
    onDelete: "CASCADE",
  });
Property.hasMany(Reservation,{
    foreignKey: "property_id",
    onDelete: "CASCADE",
})
Property.hasMany(Availability,{
    foreignKey: "property_id",
    onDelete: "CASCADE",
})

sequelize
  .sync()
  .then(() => {
    console.log("Connection has been established successfully.");
    app.listen(3000, () =>
      console.log("Started server at http://localhost:3000!")
    );
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
  });
