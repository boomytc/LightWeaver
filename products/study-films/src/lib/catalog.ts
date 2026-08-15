import dropdownTaxonomy from "../../films/dropdown-taxonomy.json";
import intentCascade from "../../films/intent-cascade.json";
import type { FilmSpec } from "./types";

export const FILM_SPECS: FilmSpec[] = [
  intentCascade as FilmSpec,
  dropdownTaxonomy as FilmSpec,
];
