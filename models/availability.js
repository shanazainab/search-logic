const {  DataTypes } = require("sequelize");
const sequelize = require("../util/database");

const Availability = sequelize.define("availability", {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true,
    },
    propertyId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "start_date",
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "end_date",
    },
    isBlocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        field: "is_blocked",
        defaultValue: false
      },
  },{schema: 'test'});
module.exports = Availability;
  