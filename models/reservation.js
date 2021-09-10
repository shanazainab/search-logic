const {  DataTypes } = require("sequelize");
const sequelize = require("../util/database");
const Reservation = sequelize.define("reservation", {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    allowNull: false,
    autoIncrement: true,
  },
  propertyId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: "property_id",


  },
  checkIn: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: "check_in",
  },
  checkOut: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: "check_out",
  },
},{schema: 'test'});


module.exports = Reservation;
