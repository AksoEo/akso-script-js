//! DO NOT LOAD DIRECTLY from main chunk

import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
import { stdlibExt } from '.';

stdlibExt.libphonenumber = { PhoneNumberUtil, PhoneNumberFormat };
