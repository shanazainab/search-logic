const { Sequelize } = require("sequelize");
const sequelize = new Sequelize(
  "postgres://postgres:Stella2020@localhost:5432/search",{
    define: {
      freezeTableName: true
    }
  }
);

module.exports = sequelize;
