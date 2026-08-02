/* Xidig theme resolution, dark-first: an explicit OS light preference gets
   light; dark or no preference resolves dark (mirrors the app's no-FOUC
   script with dark as the default). Load in <head> before stylesheets paint. */
(function(){try{
  var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)');
  var apply=function(){document.documentElement.setAttribute('data-theme',m&&m.matches?'light':'dark');};
  apply();
  if(m&&m.addEventListener)m.addEventListener('change',apply);
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();
