# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Branch selector
- User selector
- Datepicker

## [1.3.0] - 2024-07-04

### Added
- Updated booking schema with paymentMode

### Fixed
- Product restriction added to coupons

## [1.2.1] - 2024-06-27

### Removed
- Console log removed

### Changed
- Reversed activity log entries display

## [1.2.0] - 2024-06-26

### Fixed
- Fixed role condition on activity log
- Updated superadmin role in activity log

### Changed
- Log only made available for superadmins

### Added
- Audit log feature added

## [1.1.1] - 2024-06-21

### Changed
- Updated multer config for content type

## [1.1.0] - 2024-06-13

### Added
- Added email and phone check router for debounce

## [1.0.5] - 2024-06-12

### Changed
- Moved upload storage to AWS

## [1.0.4] - 2024-05-07

### Added
- UPI intent added

## [1.0.3] - 2024-05-04

### Fixed
- Reset email and receipt issue

## [1.0.2] - 2024-05-03

### Changed
- Updated resend functionality

## [1.0.1] - 2024-04-30

### Added
- Payment integration

## [1.0.0] - 2024-04-22

### Changed
- Updated coupon functionality

### Added
- Avatar functionality, bookings

### Added
- dotenv

### Changed
- Updated bookings schema
- Updated gitkeep in uploads

### Fixed
- Modified booking schema

### Removed
- Remove uploads directory from repository

### Changed
- Improved validations, added scroll top bottom

### Fixed
- Improved error handling for file uploads

### Fixed
- Fixed file upload duplicate name issue
- Fixed account inactive button not working issue

### Added
- Added feature to remove old photo upon new upload

### Added
- Added a route showuid

### Changed
- Upload directory restored

### Fixed
- Fixed server.js issue
- Call the listen method in the connect callback

### Added
- Initial commit
