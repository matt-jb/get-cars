const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const Schema = mongoose.Schema;

const carSchema = new mongoose.Schema({
  brand: {
    type: String,
    required: 'Car brand is required'
  },
  numberOfCars: {
    type: Number,
    default: 0,
    required: 'Number of cars is required'
  }
});

module.exports = mongoose.model('Car', carSchema);