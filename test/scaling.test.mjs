import assert from "node:assert/strict";
import test from "node:test";

import { activityLevel, quantileThresholds } from "../dist/activity-grid.js";

test("quantile thresholds spread heavy-tailed values across all four shades", () => {
  // Token counts are heavy-tailed: a handful of long days dwarf the rest.
  const values = [];
  for (let index = 0; index < 40; index += 1) values.push(1_000_000 + index * 50_000);
  values.push(360_000_000, 300_000_000, 250_000_000);

  const maximum = Math.max(...values);
  const linear = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const quantile = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const thresholds = quantileThresholds(values);
  values.forEach((value) => {
    linear[activityLevel(value, maximum)] += 1;
    quantile[activityLevel(value, thresholds)] += 1;
  });

  // Scaling against the maximum flattens nearly everything to the palest band.
  assert.ok(linear[1] > values.length * 0.9);
  // Quantiles keep every band populated and roughly balanced.
  [1, 2, 3, 4].forEach((band) => assert.ok(quantile[band] > 0, "band " + band + " is empty"));
  assert.ok(Math.max(...Object.values(quantile)) - Math.min(...Object.values(quantile)) <= values.length / 2);
});

test("zero and empty inputs stay at the empty shade", () => {
  assert.equal(activityLevel(0, quantileThresholds([5, 9])), 0);
  assert.equal(activityLevel(3, []), 0);
  assert.deepEqual(quantileThresholds([]), []);
  assert.deepEqual(quantileThresholds([0, 0]), []);
});

test("a single distinct value does not create unreachable bands", () => {
  const thresholds = quantileThresholds([7, 7, 7, 7]);
  assert.deepEqual(thresholds, [7]);
  assert.equal(activityLevel(7, thresholds), 4);
});

test("the largest value always lands in the top band", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 900];
  const thresholds = quantileThresholds(values);
  assert.equal(activityLevel(900, thresholds), 4);
  assert.equal(activityLevel(1, thresholds), 1);
  // Values above the recorded maximum still clamp into the top band.
  assert.equal(activityLevel(5000, thresholds), 4);
});

test("the numeric overload keeps the old linear behaviour", () => {
  assert.equal(activityLevel(100, 100), 4);
  assert.equal(activityLevel(1, 100), 1);
  assert.equal(activityLevel(0, 100), 0);
  assert.equal(activityLevel(5, 0), 0);
});
