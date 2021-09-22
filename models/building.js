const {  DataTypes} = require('sequelize');
const sequelize = require('../util/database');

const Building = sequelize.define('building',
{
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
    },
    city:{
        type:  DataTypes.ENUM ('Dubai', 'Montreal'),
        allowNull: false,
    }
},{schema: 'test'}
)


module.exports = Building