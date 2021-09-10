const express = require("express");
const router = express.Router();
const { checkSchema } = require("express-validator");
const searchController = require("../controllers/search");

router.post(
  "/search",
  checkSchema({
    city: {
      notEmpty: true,
      errorMessage: "City field cannot be empty.",
  
    },
    date: {
    optional: { options: { nullable: true } },

      custom: {
        options: (value) => {
          if (value) {
            if (!value.start || !value.end)
              throw new Error("Provide check-in and check-out date.");
          }
          return true;
        },
      },
    },
    apartmentType: {
      optional: { options: { nullable: true } },
    },
    amenities: {
      custom: {
        options: (value) => {
          if (value.length > 0) {
            let allFounded = value.every((ai) => ['WiFi', 'Pool', 'Garden', 'Tennis table', 'Parking'].includes(ai));
            if (!allFounded) throw new Error("Entered filters not available.");
          }
          return true;
        },
      },
    },
    flexible: {
        optional: { options: { nullable: true } },
    },
    "flexible.type": {
        optional: { options: { nullable: true } },

      isIn: {
        options: [["week", "weekend", "month"]],
        errorMessage: "Flexible type should be week, weekend, or month.",
      },
    },

    "flexible.months": {
        optional: { options: { nullable: true } },

      custom: {
        options: (value) => {
          if (value) {
            if (value.length === 0)
              throw new Error("List of months cannot be empty."); // check length
            let allFounded = value.every((ai) =>
              [
                "jan",
                "feb",
                "mar",
                "apr",
                "may",
                "jun",
                "jul",
                "aug",
                "sep",
                "oct",
                "nov",
                "dec",
              ].includes(ai)
            );
            if (!allFounded) throw new Error("Provide a valid list of months.");
          }
          return true;
        },
      },
    },
  }),
  searchController.getSearchResults
);

module.exports = router;
