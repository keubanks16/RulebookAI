# Adjusts the Xcode project Capacitor generates (called by scripts/ios-setup.sh).
begin
  require 'xcodeproj'
rescue LoadError
  Gem.paths = { 'GEM_PATH' => [Gem.user_dir, *Gem.path].join(File::PATH_SEPARATOR) }
  require 'xcodeproj'
end

proj = Xcodeproj::Project.open(File.expand_path('../ios/App/App.xcodeproj', __dir__))
target = proj.targets.find { |t| t.name == 'App' } or abort('App target not found')

target.build_configurations.each do |c|
  s = c.build_settings
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = ENV['APPLE_TEAM_ID'] if ENV['APPLE_TEAM_ID'] && !ENV['APPLE_TEAM_ID'].empty?
end
proj.save
puts 'Xcode project updated'
