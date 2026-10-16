
## Immutable bundled assets (#15)

The built-in workout and route libraries, static files and the prebuilt library
caches ship inside the image or AppImage and are read-only at run time.

- **Generated workouts** (the planner's own synthesised sessions, when enabled)
  are written to `<profile>/generated_workouts/`, never into the bundle. They
  resolve for download and for the workout-facts gate by file name, but are not
  part of the browsable library.
- **If writing fails** the planner uses the library's own pick and logs
  `E_GENERATED_WORKOUT_UNWRITABLE` with the file and folder. It never writes into
  the bundle as a fallback.
- **Library caches** (`.library_index.json`, the workout-facts cache) are built
  at packaging time by `tools/build-library-caches.py`. A read-only bundle with a
  stale cache re-parses in memory for that run; it does not try to write.
- **Rider folders** added in Settings are read, never written.

Verified by `tests/test_generated_workouts_dir.py`.
