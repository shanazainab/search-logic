const {  DataTypes} = require("sequelize");
const sequelize = require("../util/database");
const Property = sequelize.define(
  "property",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true,
    },
    buildingId: {
      type: DataTypes.BIGINT,
      field: "building_id",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    propertyType: {
      type: DataTypes.ENUM("1bdr", "2bdr", "3bdr"),
      allowNull: false,
      field: "property_type",
    },
    amenities: {
      type: DataTypes.ARRAY(
        DataTypes.ENUM({
          values: ["WiFi", "Pool", "Garden", "Tennis table", "Parking"],
        })
      ),
      allowNull: false,
    },
  },
  { schema: "test" }
);

module.exports = Property;
