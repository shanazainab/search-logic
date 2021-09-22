const { validationResult } = require("express-validator");
const datesController = require('./dates')
const flexibleController = require('./flexible/flexible')

exports.getSearchResults = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const date = req.body.date;
  const flexible = req.body.flexible;

  if (date && flexible) {
    res.status(400).json({
      error: {
        message: "Choose either date or flexible.",
      },
    });
  }
  if (!date && !flexible) {
    res.status(400).json({
      error: {
        message: "Provide either date or flexible.",
      },
    });
  }
  if(date){
    if (!date.start || !date.end)
    res.status(400).json({
      error: {
        message: "Provide check-in and check-out.",
      },
    });

    return datesController.getSearchResultsForDates(req,res,next)
  }
  if(flexible){
    return flexibleController.getSearchResultsForFlexible(req,res,next)
  }
};
