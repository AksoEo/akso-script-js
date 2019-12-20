//! DO NOT LOAD DIRECTLY from main chunk

import { stdlibExt } from '.';
import countriesList from 'akso-script-countries-list-see-build-script';

stdlibExt.getCountryName = name => countriesList[name] || null;

/// Overrides getCountryName. Should return a country name for a given lowercase ISO 639-1 code, and
/// must return null otherwise.
export function setGetCountryName (f) {
    stdlibExt.getCountryName = f;
}
