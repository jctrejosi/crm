; Instalador AllInOne de Ecommerce CRM.
; Requiere administrador: instala la app para todos los usuarios en
; Program Files, deja el acceso directo en el escritorio y agrega el
; certificado público de firma en los almacenes LocalMachine.
; Generado desde installer-allinone.nsi por build-windows.cjs.

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel admin
CRCCheck on

!define PRODUCT_NAME "Ecommerce CRM"
!define PRODUCT_PUBLISHER "Ecommerce"
!define PRODUCT_VERSION "@@VERSION@@"
!define PRODUCT_EXE "EcommerceCRM.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\EcommerceCRM"

Name "${PRODUCT_NAME}"
OutFile "@@OUTPUT_FILE@@"
InstallDir "$PROGRAMFILES64\Ecommerce CRM"
InstallDirRegKey HKLM "Software\Ecommerce\CRM" "InstallDir"
BrandingText "${PRODUCT_NAME}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "@@VERSION_QUAD@@"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "Instalador de Ecommerce CRM"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "LegalCopyright" "Ecommerce"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "@@ICON_FILE@@"
!define MUI_UNICON "@@ICON_FILE@@"
!define MUI_WELCOMEPAGE_TITLE "Instalación de ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Este instalador requiere permisos de administrador.$\r$\n$\r$\nInstalará ${PRODUCT_NAME} para todos los usuarios de este equipo, creará el acceso directo en el escritorio y agregará el certificado de confianza de Ecommerce.$\r$\n$\r$\nSi cancelas el aviso de administrador, no se instalará nada."
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} se instaló correctamente.$\r$\n$\r$\nAbre el acceso directo '${PRODUCT_NAME}' del escritorio para iniciar sesión."
!define MUI_FINISHPAGE_NOREBOOTSUPPORT

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

Function .onInit
  SetShellVarContext all

  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP|MB_OK "${PRODUCT_NAME} requiere Windows de 64 bits."
    Abort
  ${EndIf}

  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP|MB_OK "${PRODUCT_NAME} requiere Windows 10 o superior."
    Abort
  ${EndIf}

  SetRegView 64
FunctionEnd

Function un.onInit
  SetShellVarContext all
  SetRegView 64
FunctionEnd

Section "Ecommerce CRM" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Aplicación Electron ya empaquetada para Windows x64.
  File /r "@@SOURCE_DIR@@/*"

  ; Configuración del cliente. En actualizaciones se conserva la existente.
  IfFileExists "$INSTDIR\config.json" config_exists
    File "/oname=config.json" "@@CONFIG_FILE@@"
  config_exists:

  ; Certificado público que se agrega a la confianza del equipo.
  File "/oname=Ecommerce-JCTI-CRM-CodeSigning.cer" "@@CERT_FILE@@"

  DetailPrint "Instalando certificado de confianza de Ecommerce..."
  ${DisableX64FSRedirection}
  nsExec::ExecToLog '"$WINDIR\System32\certutil.exe" -addstore -f Root "$INSTDIR\Ecommerce-JCTI-CRM-CodeSigning.cer"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "No se pudo instalar el certificado en Entidades raíz de confianza (código $0). La aplicación se instalará igual, pero Windows puede mostrarla como editor desconocido."
  ${EndIf}

  nsExec::ExecToLog '"$WINDIR\System32\certutil.exe" -addstore -f TrustedPublisher "$INSTDIR\Ecommerce-JCTI-CRM-CodeSigning.cer"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "No se pudo instalar el certificado en Editores de confianza (código $0). La aplicación se instalará igual."
  ${EndIf}
  ${EnableX64FSRedirection}

  CreateDirectory "$SMPROGRAMS\Ecommerce"
  CreateShortcut "$SMPROGRAMS\Ecommerce\Ecommerce CRM.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0
  CreateShortcut "$DESKTOP\Ecommerce CRM.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\${PRODUCT_EXE}" 0

  WriteUninstaller "$INSTDIR\Desinstalar Ecommerce CRM.exe"

  WriteRegStr HKLM "Software\Ecommerce\CRM" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${PRODUCT_EXE}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstalar Ecommerce CRM.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Desinstalar Ecommerce CRM.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" @@ESTIMATED_SIZE@@
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  SetRegView 64

  Delete "$DESKTOP\Ecommerce CRM.lnk"
  Delete "$SMPROGRAMS\Ecommerce\Ecommerce CRM.lnk"
  RMDir "$SMPROGRAMS\Ecommerce"

  ; Quitar el certificado de confianza instalado por este instalador.
  ; Si otro producto de Ecommerce usa el mismo certificado, habrá que
  ; redistribuirlo o volver a instalarlo.
  DetailPrint "Quitando certificado de confianza de Ecommerce..."
  ${DisableX64FSRedirection}
  nsExec::ExecToLog '"$WINDIR\System32\certutil.exe" -delstore Root "@@CERT_THUMBPRINT@@"'
  Pop $0
  nsExec::ExecToLog '"$WINDIR\System32\certutil.exe" -delstore TrustedPublisher "@@CERT_THUMBPRINT@@"'
  Pop $0
  ${EnableX64FSRedirection}

  RMDir /r "$INSTDIR"

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\Ecommerce\CRM"

  ; Nota: los datos de sesión (%APPDATA%\Ecommerce CRM) se conservan a
  ; propósito, porque son por usuario y no forman parte de la instalación.
SectionEnd
