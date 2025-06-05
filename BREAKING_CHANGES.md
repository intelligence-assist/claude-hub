# Breaking Changes

## PR #181 - Enhanced Session Validation and API Documentation

### Event Pattern Change
- **Changed**: Session handler event pattern changed from `session` to `session*`
- **Impact**: Any integrations listening for specific session events may need to update their event filtering logic
- **Migration**: Update event listeners to use wildcard pattern matching or specific event names (e.g., `session.create`, `session.start`)

### Volume Naming Pattern
- **Changed**: Volume naming pattern in SessionManager changed to use a more consistent format
- **Previous**: Various inconsistent naming patterns
- **New**: Standardized naming with session ID prefixes
- **Impact**: Existing volumes created with old naming patterns may not be recognized
- **Migration**: Existing sessions may need to be recreated or volumes renamed to match new pattern

### API Validation
- **Added**: Strict UUID validation for session dependencies
- **Impact**: Sessions with invalid dependency IDs will now be rejected
- **Migration**: Ensure all dependency IDs are valid UUIDs before creating sessions