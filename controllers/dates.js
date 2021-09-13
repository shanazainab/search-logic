const Building = require("../models/building");
const Reservation = require("../models/reservation");
const { Op } = require("sequelize");
const findCommonAmenities = require("../util/common");
exports.getSearchResultsForDates = (req, res) => {
  const city = req.body.city; ///mandatory
  const date = req.body.date; ///if date start and end are mandatory

  const apartmentType = req.body.apartmentType; ///optional
  const amenitiesFilter = req.body.amenities; ///filtering

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
        attributes: ["id", "amenities", "property_type"],
        raw: true,
        nest: true,
        include: [
          {
            model: Reservation,
            required: false,
            attributes: ["id", "checkIn", "checkOut"],
            where: {
              [Op.or]: [
                {
                  [Op.and]: {
                    checkIn: {
                      [Op.between]: [date.start, date.end],
                    },
                    checkOut: {
                      [Op.between]: [date.start, date.end],
                    },
                  },
                },
                {
                  [Op.and]: {
                    checkIn: {
                      [Op.lte]: date.start,
                    },
                    checkOut: {
                      [Op.gte]: date.end,
                    },
                  },
                },
                {
                  checkIn: {
                    [Op.between]: [date.start, date.end],
                  },
                },
                {
                  checkOut: {
                    [Op.gt]: date.start,
                  },
                },
              ],
            },
          },
        ],
      });
    })
    .then(async (properties) => {
      console.log("results\n", properties);
      const availableProperties = [];
      const match = [];
      let alternative = [];
      const other = [];

      if (!properties.isEmpty) {
        ///get properties with no reservations at all
        const noReservationProperties = properties.filter(
          (p) => p.reservations.checkIn === null
        );

        ///get properties reserved in chosen check-in date to look for alternative dates, direct conflict
        const conflictReservationProperties = properties.filter(
          (p) => p.reservations.checkIn !== null
        );
        
        console.log("conflict\n", conflictReservationProperties);

        const reservedProperyIDs = conflictReservationProperties.map(
          (p) => p.id
        );

        ///get properties with reservation that dint fall on guest check-in check-out window
        const availableReservationProperties = await building.getProperties({
          attributes: ["id", "amenities", "property_type"],
          raw: true,

          where: {
            id: {
              [Op.notIn]: reservedProperyIDs,
            },
          },
        });

        availableProperties.push(...noReservationProperties);
        availableProperties.push(...availableReservationProperties);

        if (availableProperties) {
          if (!apartmentType && !amenitiesFilter) {
            const ids = availableProperties.map((e) => e.id);
            match.push(...ids);
          } else {
            /// match property with apartment type and property type
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
              } else if (amenitiesFilter) {
                console.log("go tot" , property.amenities,amenitiesFilter)
                if (findCommonAmenities(property.amenities, amenitiesFilter)) {

                  matched = true;
                  console.log("go tot" , matched)

                }
              }

              if (matched) {
                console.log("go tot" , matched)
                if (match.findIndex((x) => x == property.id) === -1)
                  match.push(property.id);
              }
            }
            if (match.isEmpty || match.length < 5) {
              for (const property of availableProperties) {
                if (apartmentType && property.property_type !== apartmentType)
                  if (other.findIndex((x) => x.id == property.id) === -1)
                    other.push({
                      id: property.id,
                      availableStarting: date.start,
                    });

                if (amenitiesFilter && !findCommonAmenities(property.amenities, amenitiesFilter))
                  if (other.findIndex((x) => x.id == property.id) === -1)
                    other.push({
                      id: property.id,
                      availableStarting: date.start,
                    });
              }
            }
          }
        }

        //look for alternatives if
        if (match.isEmpty || match.length < 5) {
          //consider conflictReservationProperties
          if (!apartmentType && !amenitiesFilter) {
            alternative.push(...conflictReservationProperties);
          }
          /// match property with apartment type
          if (apartmentType) {
            for (const property of conflictReservationProperties) {
              if (property.property_type === apartmentType)
                if (alternative.findIndex((x) => x.id == property.id) === -1)
                  alternative.push(property);
            }
          }

          ///match proprty with amenities
          if (amenitiesFilter) {
            for (const property of conflictReservationProperties) {
              if (findCommonAmenities(property.amenities, amenitiesFilter)) {
                if (alternative.findIndex((x) => x.id == property.id) === -1)
                  alternative.push(property);
              }
            }
          }
        }
      }

      ///check for possible check-in dates for alternatives

      if (!alternative.isEmpty) {
        const latestReservedAlternatives = await building.getProperties({
          attributes: ["id", "amenities", "property_type"],
          raw: true,
          nest: true,
          include: [
            {
              model: Reservation,
              where: {
                id: {
                  [Op.in]: alternative.map((a) => a.id),
                },
                checkIn: {
                  [Op.gt]: date.start,
                },
              },
              attributes: ["id", "checkIn", "checkOut"],
            },
          ],
        });
        console.log("latestalternatives\n", latestReservedAlternatives);

        if (latestReservedAlternatives.length > 0) {
          ///alternative properties are reserved for dates after requested check in
          ///Get the nearest available slots

          for (const property of latestReservedAlternatives) {
            const sameProperty = alternative.find((p) => p.id == property.id);
            const samePropertyIndex = alternative.findIndex(
              (p) => p.id == property.id
            );

            if (sameProperty) {
              console.log("same property", typeof date.start);

              var Difference_In_Days =
                (Date.parse(sameProperty.reservations.checkOut) -
                  Date.parse(property.reservations.checkIn)) /
                (1000 * 3600 * 24);
              var los =
                (Date.parse(date.start) - Date.parse(date.end)) /
                (1000 * 3600 * 24);
              console.log("in days\n", Difference_In_Days);
              console.log("los\n", los);

              if (Difference_In_Days > los) {
                //alter available check in date
                alternative[samePropertyIndex] = {
                  id: property.id,
                  availableStarting: property.reservations.checkOut,
                };
              }
            } else {
              alternative.push({
                id: property.id,
                availableStarting: property.reservations.checkOut,
              });
            }
          }
        } else {
          alternative = alternative.map((p) => {
            return {
              id: p.id,
              availableStarting: p.reservations.checkOut,
            };
          });
        }

        alternative = alternative.map((p) => {
          return {
            id: p.id,
            availableStarting: p.reservations
              ? p.reservations.checkOut
              : p.availableStarting,
          };
        });
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
