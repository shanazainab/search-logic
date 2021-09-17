const Building = require("../../models/building");
const Reservation = require("../../models/reservation");
const { Op } = require("sequelize");
const sequelize = require("../../util/database");
const findCommonAmenities = require("../../util/common");

exports.getSearchResultsForFlexible = (req, res) => {
  const city = req.body.city; ///mandatory
  const flexible = req.body.flexible; ///if flexible type is mandatory
  const apartmentType = req.body.apartmentType; ///optional
  const amenitiesFilter = req.body.amenities; ///filtering
  const monthCollection = [
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
  ];

  ///Get the list of chosen months
  const chosenMonths = flexible.months.map((month) =>
    monthCollection.indexOf(month)
  );
  chosenMonths.sort(function (a, b) {
    return a - b;
  });

  //Get the list of possible flexi days
  const chosenFlexibleDays = [];

  let noOfNights;

  if (flexible.type === "week") noOfNights = 7;
  else if (flexible.type === "weekend") noOfNights = 2;
  else if (flexible.type === "month") noOfNights = 30;

  for (const month of chosenMonths) {
    var now = new Date();
    var startDay = new Date(
      Date.UTC(now.getUTCFullYear(), month + 1, 0, 0, 0, 0)
    );

    var totalNoOfDays = startDay.getDate();
    for (var i = 1; i <= totalNoOfDays; ++i) {
      var day = new Date(
        new Date(Date.UTC(now.getUTCFullYear(), month, i, 0, 0, 0))
      );

      if (
        noOfNights === 2 &&
        city === "Dubai" &&
        (day.getDay() === 5 || day.getDay() === 4)
      ) {
        ///weekend
        chosenFlexibleDays.push(day);
      } else if (
        noOfNights === 2 &&
        city === "Montreal" &&
        (day.getDay() === 5 || day.getDay() === 6)
      ) {
        ///weekend
        chosenFlexibleDays.push(day);
      } else if (noOfNights !== 2) chosenFlexibleDays.push(day);
    }
  }

  console.log("chosenflexible", chosenFlexibleDays);

  let building;
  Building.findAll({
    attributes: ["id", "city"],
    where: {
      city: city,
    },
  })
    .then((buildings) => {
      building = buildings[0];
      return building.getProperties({
        attributes: ["id", "property_type", "amenities"],
        raw: true,
        nest: true,
        include: [
          {
            model: Reservation,
            required: false,
            where: sequelize.where(
              sequelize.fn(
                "date_part",
                "month",
                sequelize.col("reservations.check_in")
              ),
              {
                [Op.in]: chosenMonths.map((e) => e + 1),
              }
            ),
            attributes: ["id", "check_in", "check_out"],
          },
        ],
      });
    })
    .then(async (properties) => {
      console.log("properties", properties);
      const availableProperties = [];
      const match = [];
      let alternative = [];
      const other = [];
      const conflictAlternatives = [];

      ///get properties with no reservations at all
      const noReservationProperties = properties.filter(
        (p) => p.reservations.check_in === null
      );

      console.log("NO RESERSVATION AT ALL: ", noReservationProperties);
      ///get properties reserved in chosen check-in date to look for alternative dates
      const existingReservationProperties = properties.filter(
        (p) => p.reservations.check_in !== null
      );
      console.log("EXISITING RESERSVATION: ", existingReservationProperties);
      for (const property of noReservationProperties) {
        //set available dates
        ///TODO:find the first day of each month
        for (const month of chosenMonths) {
          var startDay = new Date(
            new Date(Date.UTC(new Date().getUTCFullYear(), month, 1, 0, 0, 0))
          );
          const availProperty = JSON.parse(JSON.stringify(property));
          if (flexible.type === "weekend") {
            let displacement;
            if (city === "Dubai") displacement = 4;
            else displacement = 5;
            var weekend = new Date(
              startDay.setDate(
                startDay.getDate() +
                  (displacement -
                    (startDay.getDay() === 5
                      ? -2
                      : startDay.getDay() === 6
                      ? -1
                      : startDay.getDay()))
              )
            );
            availProperty.reservations.check_in = weekend;
          } else availProperty.reservations.check_in = startDay;
          availableProperties.push(availProperty);
        }
      }

      ///group existing reservations based on id
      const groupedReservations = existingReservationProperties.reduce(
        (entryMap, e) => entryMap.set(e.id, [...(entryMap.get(e.id) || []), e]),
        new Map()
      );

      groupedReservations.forEach((reservedProperties) => {
        reservedProperties.sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });
        for (const flexiCheckInDate of chosenFlexibleDays) {
          ///create a list of days in the check out window
          var flexiCheckOutDate = new Date(
            Date.UTC(
              flexiCheckInDate.getUTCFullYear(),
              flexiCheckInDate.getUTCMonth(),
              flexiCheckInDate.getUTCDate(),
              0,
              0,
              0,
              0
            )
          );
          flexiCheckOutDate.setDate(
            flexiCheckInDate.getDate() + (noOfNights - 1)
          );

          if (
            !reservedProperties.find((p) =>
              findConflicts(
                flexiCheckInDate.getTime(),
                flexiCheckOutDate.getTime(),
                Date.parse(p.reservations.check_in),
                Date.parse(p.reservations.check_out)
              )
            )
          ) {
            const availProperty = JSON.parse(
              JSON.stringify(reservedProperties[0])
            );

            availProperty.reservations.check_in = flexiCheckInDate;
            availableProperties.push(availProperty);
            break;
          }
        }

        ///todo alternative
        var possibleCheckInDate = reservedProperties[0].reservations.check_out;
        for (var i = 1; i < reservedProperties.length; ++i) {
          var Difference_In_Days =
            (Date.parse(possibleCheckInDate) -
              Date.parse(reservedProperties[i].reservations.checkIn)) /
            (1000 * 3600 * 24);
          var los = noOfNights;

          if (Difference_In_Days > los) {
            possibleCheckInDate = reservedProperties[i].reservations.check_out;
          }
        }
        conflictAlternatives.push({
          id: reservedProperties[0].id,
          property_type: reservedProperties[0].property_type,
          amenities: reservedProperties[0].amenities,
          availableStarting: possibleCheckInDate,
        });
      });

      if (availableProperties) {
        if (!apartmentType && !amenitiesFilter) {
          const ids = availableProperties.map((property) => {
            return {
              id: property.id,
              availableStarting: property.reservations.check_in,
            };
          });
          match.push(...ids);
        }

        /// match property with apartment type
        if (apartmentType) {
          for (const property of availableProperties) {
            if (property.property_type === apartmentType)
              if (match.findIndex((x) => x.id == property.id) === -1)
                match.push({
                  id: property.id,
                  availableStarting: property.reservations.check_in,
                });
          }
        }

        ///match proprty with amenities
        if (amenitiesFilter) {
          for (const property of availableProperties) {
            if (findCommonAmenities(property.amenities, amenitiesFilter))
              if (match.findIndex((x) => x.id == property.id) === -1)
                match.push({
                  id: property.id,
                  availableStarting: property.reservations.check_in,
                });
          }
        }
      }
      if (match.isEmpty || match.length < 5) {
        for (const property of availableProperties) {
          if (
            !findCommonAmenities(property.amenities, amenitiesFilter) ||
            property.property_type !== apartmentType
          )
            if (other.findIndex((x) => x.id == property.id) === -1)
              other.push({
                id: property.id,
                availableStarting: property.reservations.check_in,
              });
        }
        //alternative

        for (const alters of conflictAlternatives) {
          if (
            match.findIndex((x) => x.id == alters.id) === 0 &&
            (findCommonAmenities(alters.amenities, amenitiesFilter) ||
              alters.property_type === apartmentType)
          )
            alternative.push({
              id: alters.id,
              availableStarting:alters.availableStarting
            });
        }
      }

      res.status(200).json({
        results: {
          match: match,
          alternative: alternative,
          other: other,
        },
      });
    });
};

const findConflicts = (
  flexibleCheckInDate,
  flexibleCheckOutDate,
  checkInDate,
  checkOutDate
) => {
  return (
    (checkInDate >= flexibleCheckInDate &&
      checkOutDate <= flexibleCheckOutDate) ||
    (checkInDate <= flexibleCheckInDate &&
      checkOutDate >= flexibleCheckOutDate) ||
    (checkInDate >= flexibleCheckInDate &&
      checkInDate <= flexibleCheckOutDate &&
      checkOutDate >= flexibleCheckOutDate) ||
    (checkOutDate >= flexibleCheckInDate &&
      checkOutDate <= flexibleCheckOutDate &&
      checkOutDate != flexibleCheckInDate &&
      checkInDate <= flexibleCheckInDate)
  );
};
