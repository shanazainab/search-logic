const Building = require("../models/building");
const Reservation = require("../models/reservation");
const Availability = require("../models/availability");

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
                  [Op.and]: {
                    checkIn: {
                      [Op.between]: [date.start, date.end],
                    },
                    checkOut: {
                      [Op.gte]: date.end,
                    },
                  },
                },
                {
                  [Op.and]: {
                    checkIn: {
                      [Op.lte]: date.start,
                    },
                    checkOut: {
                      [Op.and]: {
                        [Op.between]: [date.start, date.end],
                        [Op.notIn]: [date.start],
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      });
    })
    .then(async (properties) => {
      ///All properties with no reservation or reserved on chosen check-in checkout slot
      console.log("properties with no reservation or reserved on chosen check-in checkout slot: \n", properties);
      const availableProperties = [];
      const match = [];
      let alternative = [];
      const other = [];

      if (!properties.isEmpty) {
        ///get properties with no reservations at all
        var noReservationProperties = properties.filter(
          (p) => p.reservations.checkIn === null
        );

        ///get properties reserved in chosen check-in date to look for alternative dates / direct conflict
        const conflictReservationProperties = properties.filter(
          (p) => p.reservations.checkIn !== null
        );
        console.log("No reservation properties: \n", conflictReservationProperties);

        console.log("conflict reservation properties: \n", conflictReservationProperties);

        const reservedProperyIDs = conflictReservationProperties.map(
          (p) => p.id
        );

        ///get properties with reservation that did not fall on guest check-in check-out slot
        var availableReservationProperties = await building.getProperties({
          attributes: ["id", "amenities", "property_type"],
          raw: true,

          where: {
            id: {
              [Op.notIn]: reservedProperyIDs,
            },
          },
        });
        console.log("other properties available on chosen check-in checkout slot: \n", availableReservationProperties);

        ///get all blocked properties on the check-in check out date
        const blockedProperties = await building.getProperties({
          attributes: ["id", "amenities", "property_type"],
          raw: true,
          include: [
            {
              model: Availability,
              required: true,
              attributes: ["id", "startDate", "endDate", "isBlocked"],
              where: {
                id: {
                  [Op.or]:[
                  {
                    [Op.in]: noReservationProperties.map((e) => e.id),
                  },{
                    [Op.in]: availableReservationProperties.map((e) => e.id),

                  }
                  ]
                
                },
                isBlocked: {
                  [Op.eq]: true,
                },
                [Op.or]: [
                  {
                    [Op.and]: {
                      startDate: {
                        [Op.between]: [date.start, date.end],
                      },
                      endDate: {
                        [Op.between]: [date.start, date.end],
                      },
                    },
                  },
                  {
                    [Op.and]: {
                      startDate: {
                        [Op.lte]: date.start,
                      },
                      endDate: {
                        [Op.gte]: date.end,
                      },
                    },
                  },
                  {
                    [Op.and]: {
                      startDate: {
                        [Op.between]: [date.start, date.end],
                      },
                      endDate: {
                        [Op.gte]: date.end,
                      },
                    },
                  },
                  {
                    [Op.and]: {
                      startDate: {
                        [Op.lte]: date.start,
                      },
                      endDate: {
                        [Op.and]: {
                          [Op.between]: [date.start, date.end],
                          [Op.notIn]: [date.start],
                        },
                      },
                    },
                  },
                ],
              },
              
            },
          ],
        });
        console.log("blocked properties on chosen check-in checkout slot: \n",blockedProperties)

        const blockedPropertiesIds = blockedProperties.map((e) => e.id);
        noReservationProperties = noReservationProperties.filter((value) => {
          return !(blockedPropertiesIds.includes(value.id));
        });
        availableReservationProperties = availableReservationProperties.filter((value) => {
          return !(blockedPropertiesIds.includes(value.id));
        });
        availableProperties.push(...noReservationProperties);
        availableProperties.push(...availableReservationProperties);

        console.log("Availble properties for reservation: \n",availableProperties)

        ///group and filter based on apartment type and amenities
        if (availableProperties) {
          if (
            !apartmentType &&
            (!amenitiesFilter || !amenitiesFilter.length > 0)
          ) {
            const ids = availableProperties.map((e) => e.id);
            match.push(...new Set(ids));
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
              } else if (amenitiesFilter && amenitiesFilter.length > 0) {
                if (findCommonAmenities(property.amenities, amenitiesFilter)) {
                  matched = true;
                }
              }

              if (matched) {
                if (match.findIndex((x) => x == property.id) === -1)
                  match.push(property.id);
              }
            }
            if (match.isEmpty || match.length < 5) {
              //available properties which doesnot match apartment type or amenities are grouped to "other"
              for (const property of availableProperties) {
                if (apartmentType && property.property_type !== apartmentType)
                  if (other.findIndex((x) => x.id == property.id) === -1)
                    other.push({
                      id: property.id,
                      availableStarting: date.start,
                    });

                if (
                  amenitiesFilter &&
                  amenitiesFilter.length > 0 &&
                  !findCommonAmenities(property.amenities, amenitiesFilter)
                )
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
          //filter based on apartment type and amenities
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

          ///match property with amenities
          if (amenitiesFilter && amenitiesFilter.length > 0) {
            for (const property of conflictReservationProperties) {
              if (findCommonAmenities(property.amenities, amenitiesFilter)) {
                if (alternative.findIndex((x) => x.id == property.id) === -1)
                  alternative.push(property);
              }
            }
          }
        }
      }

      ///check for possible check-in dates for alternatives stays
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
              order: [
                ['checkIn', 'ASC'],
            ],
              attributes: ["id", "checkIn", "checkOut"],
            },
          ],
        });


      
        if (latestReservedAlternatives.length > 0) {
          ///alternative properties that are reserved for dates after requested check in
          ///Get the nearest available slots
          for (const property of latestReservedAlternatives) {
            const sameProperty = alternative.find((p) => p.id == property.id);
            const samePropertyIndex = alternative.findIndex(
              (p) => p.id == property.id
            );

            if (sameProperty) {
              var differenceInDays =
                (Date.parse(sameProperty.reservations.checkOut) -
                  Date.parse(property.reservations.checkIn)) /
                (1000 * 3600 * 24);
              var los =
                (Date.parse(date.start) - Date.parse(date.end)) /
                (1000 * 3600 * 24);
            
              if (differenceInDays > los) {
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
    }).catch(e => {
      res.status(400).json({
        error: e,
      });
    });
};
