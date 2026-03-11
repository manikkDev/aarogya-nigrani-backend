const { randomUUID } = require("crypto");

const riskFromRatio = (ratio) => {
  if (ratio >= 1.6) return "critical";
  if (ratio >= 1.3) return "high";
  if (ratio >= 1.1) return "medium";
  return "low";
};

const generateOutbreakAlerts = (weeklyTrends, subDistricts) => {
  if (!weeklyTrends || weeklyTrends.length === 0) return [];
  const last = weeklyTrends[weeklyTrends.length - 1];
  const avgVector = weeklyTrends.reduce((sum, w) => sum + w.vectorBorne, 0) / weeklyTrends.length;
  const avgWater = weeklyTrends.reduce((sum, w) => sum + w.waterBorne, 0) / weeklyTrends.length;
  const alerts = [];
  subDistricts.forEach((sd) => {
    const vectorRatio = avgVector ? last.vectorBorne / avgVector : 1;
    const waterRatio = avgWater ? last.waterBorne / avgWater : 1;
    if (vectorRatio >= 1.1) {
      alerts.push({
        id: randomUUID(),
        subDistrictId: sd.id,
        subDistrictName: sd.name,
        type: "outbreak",
        severity: riskFromRatio(vectorRatio),
        message: `Vector-borne cases are ${Math.round(vectorRatio * 100)}% of baseline`,
        timestamp: new Date().toISOString(),
        disease: "Vector-borne",
        isResolved: false,
      });
    }
    if (waterRatio >= 1.1) {
      alerts.push({
        id: randomUUID(),
        subDistrictId: sd.id,
        subDistrictName: sd.name,
        type: "outbreak",
        severity: riskFromRatio(waterRatio),
        message: `Water-borne cases are ${Math.round(waterRatio * 100)}% of baseline`,
        timestamp: new Date().toISOString(),
        disease: "Water-borne",
        isResolved: false,
      });
    }
  });
  return alerts;
};

const generateFacilityAlerts = (facilities) => {
  return facilities.flatMap((facility) => {
    const alerts = [];
    const occupancy = facility.totalBeds ? facility.occupiedBeds / facility.totalBeds : 0;
    if (occupancy >= 0.85) {
      alerts.push({
        id: randomUUID(),
        subDistrictId: facility.subDistrictId,
        subDistrictName: facility.subDistrictName,
        facilityId: facility.id,
        facilityName: facility.name,
        type: "bed",
        severity: occupancy >= 0.95 ? "critical" : "high",
        message: `${facility.name} bed occupancy at ${Math.round(occupancy * 100)}%`,
        timestamp: new Date().toISOString(),
        isResolved: false,
      });
    }
    facility.medicineStock.forEach((stock) => {
      if (stock.status !== "OK") {
        alerts.push({
          id: randomUUID(),
          subDistrictId: facility.subDistrictId,
          subDistrictName: facility.subDistrictName,
          facilityId: facility.id,
          facilityName: facility.name,
          type: "stock",
          severity: stock.status === "Out" ? "high" : "medium",
          message: `${stock.name} stock ${stock.status} at ${facility.name}`,
          timestamp: new Date().toISOString(),
          isResolved: false,
        });
      }
    });
    return alerts;
  });
};

const generateCampaignAlerts = (subDistricts) =>
  subDistricts.map((sd) => ({
    id: randomUUID(),
    subDistrictId: sd.id,
    subDistrictName: sd.name,
    type: "general",
    severity: "low",
    message: `Vaccination and health awareness drive scheduled in ${sd.name}`,
    timestamp: new Date().toISOString(),
    isResolved: false,
  }));

const computeDashboardStats = (subDistricts, facilities, weeklyTrends) => {
  const totalPopulation = subDistricts.reduce((sum, sd) => sum + sd.population, 0);
  const totalFacilities = facilities.length;
  const totalBeds = facilities.reduce((sum, f) => sum + f.totalBeds, 0);
  const occupiedBeds = facilities.reduce((sum, f) => sum + f.occupiedBeds, 0);
  const immunizationRate = Math.round(
    subDistricts.reduce((sum, sd) => sum + sd.healthMetrics.immunizationCoverage, 0) / subDistricts.length
  );
  const ancRegistrations = subDistricts.reduce((sum, sd) => sum + sd.healthMetrics.ancRegistrations, 0);
  const deliveriesAtFacility = subDistricts.reduce((sum, sd) => sum + sd.healthMetrics.deliveriesAtFacility, 0);
  const latest = weeklyTrends[weeklyTrends.length - 1] || { vectorBorne: 0, waterBorne: 0 };
  return {
    totalPopulation,
    totalFacilities,
    activeCases: {
      vectorBorne: latest.vectorBorne,
      waterBorne: latest.waterBorne,
    },
    bedOccupancy: {
      total: totalBeds,
      occupied: occupiedBeds,
      percentage: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    },
    immunizationRate,
    ancRegistrations,
    deliveriesAtFacility,
  };
};

const refreshAlerts = (data) => {
  const { weeklyTrends, subDistricts, facilities } = data;
  const alerts = [
    ...generateOutbreakAlerts(weeklyTrends, subDistricts),
    ...generateFacilityAlerts(facilities),
    ...generateCampaignAlerts(subDistricts),
  ];
  return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

module.exports = {
  refreshAlerts,
  computeDashboardStats,
};
