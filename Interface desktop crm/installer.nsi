; Instalador de Ecommerce CRM (por usuario, sin privilegios de administrador).
; Este archivo es una plantilla: build-windows.cjs reemplaza los @@TOKENS@@.

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
CRCCheck on

!define PRODUCT_NAME "Ecommerce CRM"
!define PRODUCT_PUBLISHER "Ecommerce"
!define PRODUCT_VERSION "@@VERSION@@"
!define PRODUCT_EXE "EcommerceCRM.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\EcommerceCRM"

Name "${PRODUCT_NAME}"
OutFile "@@OUTPUT_FILE@@"
InstallDir "$LOCALAPPDATA\Programs\Ecommerce CRM"
InstallDirRegKey HKCU "Software\Ecommerce\CRM" "InstallDir"
BrandingText "${PRODUCT_NAME}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "@@VERSION_QUAD@@"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "Acceso de escritorio al panel CRM de Ecommerce"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "LegalCopyright" "Ecommerce"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "@@ICON_FILE@@"
!define MUI_UNICON "@@ICON_FILE@@"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Ecommerce CRM"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

Function .onInit
  SetShellVarContext current
FunctionEnd

Function un.onInit
  SetShellVarContext current
FunctionEnd

Section "Ecommerce CRM" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Aplicacion Electron ya empaquetada para Windows x64.
  File /r "@@SOURCE_DIR@@/*"

  ; Configuracion editable (URL del panel). En actualizaciones se conserva la
  ; que ya tenga el usuario.
  IfFileExists "$INSTDIR\config.json" config_exists
    File "/oname=config.json" "@@CONFIG_FILE@@"
  config_exists:

  CreateDirectory "$SMPROGRAMS\Ecommerce"
  CreateShortcut "$SMPROGRAMS\Ecommerce\Ecommerce CRM.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0
  CreateShortcut "$DESKTOP\Ecommerce CRM.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0

  WriteUninstaller "$INSTDIR\Desinstalar Ecommerce CRM.exe"

  WriteRegStr HKCU "Software\Ecommerce\CRM" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${PRODUCT_EXE}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstalar Ecommerce CRM.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Desinstalar Ecommerce CRM.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" @@ESTIMATED_SIZE@@
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Ecommerce CRM.lnk"
  Delete "$SMPROGRAMS\Ecommerce\Ecommerce CRM.lnk"
  RMDir "$SMPROGRAMS\Ecommerce"

  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\Ecommerce\CRM"

  ; Nota: los datos de sesion (%APPDATA%\Ecommerce CRM) se conservan a
  ; proposito para no cerrar la sesion del usuario al reinstalar.
SectionEnd
