const Building = require("../../models/building");
const Reservation = require("../../models/reservation");
const { Op } = require("sequelize");
const sequelize = require("../../util/database");
const findCommonAmenities = require("../../util/common");
const Availability = require("../../models/availability");

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

  //set no of nights requested
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
        ///weekend in Dubai
        chosenFlexibleDays.push(day);
      } else if (
        noOfNights === 2 &&
        city === "Montreal" &&
        (day.getDay() === 5 || day.getDay() === 6)
      ) {
        ///weekend in Montreal
        chosenFlexibleDays.push(day);
      } else if (noOfNights !== 2) chosenFlexibleDays.push(day);
    }
  }

  console.log("Possible flexible days: \n", chosenFlexibleDays);

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

      console.log("Properties with no reservation in chosen months: \n", noReservationProperties);

      ///get properties reserved in chosen months
      const existingReservationProperties = properties.filter(
        (p) => p.reservations.check_in !== null
      );
      console.log("Properties with reservation in chosen months: ", existingReservationProperties);

      //get blocked apartment in the chosen months for maintenence
      const blockedProperties = await building.getProperties({
        attributes: ["id", "amenities", "property_type"],
        raw: true,
        nest: true,

        include: [
          {
            model: Availability,
            required: true,
            attributes: ["id", "startDate", "endDate", "isBlocked"],
            where: {
              [Op.or]: [
                sequelize.where(
                  sequelize.fn(
                    "date_part",
                    "month",
                    sequelize.col("availabilities.start_date")
                  ),
                  {
                    [Op.in]: chosenMonths.map((e) => e + 1),
                  }
                ),
                sequelize.where(
                  sequelize.fn(
                    "date_part",
                    "month",
                    sequelize.col("availabilities.end_date")
                  ),
                  {
                    [Op.in]: chosenMonths.map((e) => e + 1),
                  }
                ),
              ],
              isBlocked: {
                [Op.eq]: true,
              },
              id: {
                [Op.or]: [
                  {
                    [Op.in]: noReservationProperties.map((e) => e.id),
                  },
                  {
                    [Op.in]: existingReservationProperties.map((e) => e.id),
                  },
                ],
              },
            },
          },
        ],
      });

      //find available starting date for properties with no reservation considering blocked properties list
      for (const property of noReservationProperties) {
        const availProperty = JSON.parse(JSON.stringify(property));

        for (const flexibleDay of chosenFlexibleDays) {
          if (
            !blockedProperties.find(
              (b) =>
                b.id === property.id &&
                flexibleDay >= Date.parse(b.availabilities.startDate) &&
                flexibleDay <= Date.parse(b.availabilities.endDate)
            )
          ) {
            var add = false;
            if (flexible.type === "weekend") {
              if (
                (city === "Dubai" && flexibleDay.getDay() == 4) ||
                (city === "Montreal" && flexibleDay.getDay() == 5)
              )
                add = true;
            } else add = true;

            if (add) {
              availProperty.reservations.check_in = flexibleDay;
              availableProperties.push(availProperty);
              break;
            }
          }
        }
      }

      ///group existing reservations based on property id
      const groupedReservations = existingReservationProperties.reduce(
        (entryMap, e) => entryMap.set(e.id, [...(entryMap.get(e.id) || []), e]),
        new Map()
      );

      groupedReservations.forEach((reservedProperties) => {
        reservedProperties.sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });
        for (const flexiCheckInDate of chosenFlexibleDays) {
          ///get the possible checkout date taking no of nights
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

          //check for conflicting reservation or maintence blocks
          if (
            !reservedProperties.find((p) =>
              findConflicts(
                flexiCheckInDate.getTime(),
                flexiCheckOutDate.getTime(),
                Date.parse(p.reservations.check_in),
                Date.parse(p.reservations.check_out)
              )
            ) &&
            !blockedProperties.find(
              (b) =>
                b.id === reservedProperties.id &&
                findConflicts(
                  flexiCheckInDate.getTime(),
                  flexiCheckOutDate.getTime(),
                  Date.parse(b.availabilities.startDate),
                  Date.parse(b.availabilities.endDate)
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


        //check for alternative dates if any (with lesser no of nights )
        var possibleCheckInDate = reservedProperties[0].reservations.check_out;
        for (var i = 1; i < reservedProperties.length; ++i) {
          var differenceInDays =
            (Date.parse(possibleCheckInDate) -
              Date.parse(reservedProperties[i].reservations.checkIn)) /
            (1000 * 3600 * 24);
          var los = 1;

          if (differenceInDays > los) {
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

      //filter results based on apartment type and amennities filter
      if (availableProperties) {
        if (!apartmentType && !amenitiesFilter) {
          const ids = availableProperties.map((property) => {
            return {
              id: property.id,
              availableStarting: property.reservations.check_in,
            };
          });
          match.push(...ids);
        } else {
          for (const property of availableProperties) {
            let matched = false;
            if (apartmentType && amenitiesFilter) {
              if (
                property.property_type === apartmentType &&
                findCommonAmenities(property.amenities, amenitiesFilter)
              ) {
                matched = true;
              }
            } else if (apartmentType) {
              if (property.property_type === apartmentType) matched = true;
            } else if (amenitiesFilter && amenitiesFilter.length > 0) {
              if (findCommonAmenities(property.amenities, amenitiesFilter)) {
                matched = true;
              }
            }

            if (matched) {
              if (match.findIndex((x) => x == property.id) === -1)
                match.push({
                  id: property.id,
                  availableStarting: property.reservations.check_in,
                });
            }
          }
        }
      }
      // filter and group results to "other" based on apartment type and amenities filter
      if (match.isEmpty || match.length < 5) {
        for (const property of availableProperties) {
          if (
            (amenitiesFilter &&
              !findCommonAmenities(property.amenities, amenitiesFilter)) ||
            (apartmentType && property.property_type !== apartmentType)
          )
            if (other.findIndex((x) => x.id == property.id) === -1)
              other.push({
                id: property.id,
                availableStarting: property.reservations.check_in,
              });
        }

        //filter alternative dates results
        for (const alters of conflictAlternatives) {
          if (match.findIndex((x) => x.id == alters.id) === -1) {
            let matched = false;
            if (apartmentType && amenitiesFilter) {
              if (
                alters.property_type === apartmentType &&
                findCommonAmenities(alters.amenities, amenitiesFilter)
              ) {
                matched = true;
              }
            } else if (apartmentType) {
              if (alters.property_type === apartmentType) matched = true;
            } else if (amenitiesFilter && amenitiesFilter.length > 0) {
              if (findCommonAmenities(alters.amenities, amenitiesFilter)) {
                matched = true;
              }
            }

            if (matched) {
              if (alternative.findIndex((x) => x == alters.id) === -1)
                alternative.push({
                  id: alters.id,
                  availableStarting: alters.availableStarting,
                });
            }
          }
        }
      }

      res.status(200).json({
        results: {
          match: match,
          alternative: alternative,
          other: other,
        },
      });
    }).catch(e => {
      res.status(400).json({
        error: e,
      });
    });
};

const findConflicts = (
  flexibleCheckInDate,
  flexibleCheckOutDate,
  checkInDate,
  checkOutDate
) => {
  ///check whether new check in dates falls between existing reservation dates 
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
