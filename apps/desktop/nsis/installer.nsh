; The assisted directory page accepts arbitrary paths, including silent /D overrides.
; A hidden, required first section runs on the final selection before electron-builder's
; install section can uninstall an older version or extract any application files.
!macro RejectInstallation REASON
  MessageBox MB_OK|MB_ICONSTOP "${REASON}" /SD IDOK
  SetErrorLevel 3
  Quit
!macroend

!macro CheckDirectory PATH
  StrCpy $R8 "${PATH}"
  System::Call 'kernel32::GetFileAttributesW(w R8) i.r2 ?e'
  Pop $R9
  ${If} $2 == -1
    ${If} $R9 != 2 ; ERROR_FILE_NOT_FOUND
    ${AndIf} $R9 != 3 ; ERROR_PATH_NOT_FOUND
      !insertmacro RejectInstallation "Cannot inspect '$R8' (Windows error $R9). Check its permissions and retry."
    ${EndIf}
  ${Else}
    IntOp $2 $2 & 0x400
    ${If} $2 != 0
      !insertmacro RejectInstallation "This installation contains a linked directory: $R8. Move the link aside before continuing."
    ${EndIf}
  ${EndIf}
!macroend

; DeleteFileW distinguishes an already removed file from a permission or sharing error.
; Stop before removing the uninstaller or registration when the user needs to retry.
!macro RemoveInstalledFile PATH
  StrCpy $R8 "${PATH}"
  System::Call 'kernel32::DeleteFileW(w R8) i.r2 ?e'
  Pop $R9
  ${If} $2 == 0
  ${AndIf} $R9 != 2 ; ERROR_FILE_NOT_FOUND
  ${AndIf} $R9 != 3 ; ERROR_PATH_NOT_FOUND
    !insertmacro RejectInstallation "Cannot remove '$R8' (Windows error $R9). Close applications using it, check its permissions, and retry."
  ${EndIf}
!macroend

!macro CheckDirectoryChain PATH
  StrCpy $R7 "${PATH}"
  ${DoWhile} $R7 != ""
    !insertmacro CheckDirectory "$R7"
    ${GetParent} "$R7" $R8
    ${If} $R8 == $R7
      ${ExitDo}
    ${EndIf}
    StrCpy $R7 $R8
  ${Loop}
!macroend

!macro CheckPreviousInstallation ROOT
  ReadRegStr $0 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" UninstallString
  !ifdef UNINSTALL_REGISTRY_KEY_2
    ${If} $0 == ""
      ReadRegStr $0 ${ROOT} "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    ${EndIf}
  !endif
  ${If} $0 != ""
    ReadRegStr $1 ${ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation
    ReadRegStr $2 ${ROOT} "${INSTALL_REGISTRY_KEY}" FileScopedUninstaller
    ; An older recursive uninstaller can remove unrelated files even when the NEW
    ; destination is empty. Never invoke it automatically.
    ${If} $2 != "1"
    ${OrIf} $1 == ""
    ${OrIfNot} ${FileExists} "$1\${UNINSTALL_FILENAME}"
      !insertmacro RejectInstallation "Cannot safely upgrade the registered installation in '$1'. Back up its directory and resolve the old installation before continuing."
    ${EndIf}
    !insertmacro CheckDirectoryChain "$1"
    ${If} $1 == $INSTDIR
      StrCpy $3 "owned"
    ${EndIf}
  ${EndIf}
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    ; FindFirst/FindNext collapse access errors and normal exhaustion. Check the
    ; Win32 errors directly so only an empty or missing destination is accepted.
    Function CheckEmptyDestination
      ; WIN32_FIND_DATAW, including cFileName and cAlternateFileName.
      System::Call '*(i,l,l,l,i,i,i,i,&w260,&w14) p .r0'
      ${If} $0 == 0
        !insertmacro RejectInstallation "Cannot allocate memory to inspect the selected installation directory."
      ${EndIf}
      System::Call 'kernel32::FindFirstFileW(w "$INSTDIR\*", p r0) p.r1 ?e'
      Pop $2
      ${If} $1 == -1
        System::Free $0
        ${If} $2 == 2 ; ERROR_FILE_NOT_FOUND: no matching entry
        ${OrIf} $2 == 3 ; ERROR_PATH_NOT_FOUND: the directory does not exist
          Return
        ${EndIf}
        Goto cannotListDestination
      ${EndIf}
      ${Do}
        System::Call '*$0(i,l,l,l,i,i,i,i,&w260 .r3,&w14)'
        ${If} $3 != "."
        ${AndIf} $3 != ".."
          System::Call 'kernel32::FindClose(p r1)'
          System::Free $0
          !insertmacro RejectInstallation "The selected installation directory is not empty. Choose an empty directory for ${PRODUCT_NAME}."
        ${EndIf}
        System::Call 'kernel32::FindNextFileW(p r1, p r0) i.r3 ?e'
        Pop $2
      ${LoopWhile} $3 != 0
      System::Call 'kernel32::FindClose(p r1)'
      System::Free $0
      ${If} $2 == 18 ; ERROR_NO_MORE_FILES
        Return
      ${EndIf}
      cannotListDestination:
      !insertmacro RejectInstallation "Cannot list '$INSTDIR' (Windows error $2). Choose a directory you can read."
    FunctionEnd

    Section "-Check installation directory"
      SectionIn RO
      !insertmacro CheckDirectoryChain "$INSTDIR"
      StrCpy $3 ""
      !insertmacro CheckPreviousInstallation SHELL_CONTEXT
      ${If} $installMode == "all"
        ; A per-machine install also uninstalls an existing per-user version.
        !insertmacro CheckPreviousInstallation HKCU
      ${EndIf}
      ${If} $3 != "owned"
        Call CheckEmptyDestination
      ${EndIf}
    SectionEnd
  !endif
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" FileScopedUninstaller "1"
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" PayloadArch "$packageArch"
!macroend

; Paths are compiled into this version's uninstaller from the packaged payload.
; Delete only shipped files and remove directories only when empty. User-created
; files survive upgrades, directory changes and uninstall.
!macro customRemoveFiles
  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 != $INSTDIR
    !insertmacro RejectInstallation "The uninstaller directory does not match the registered installation."
  ${EndIf}
  !insertmacro CheckDirectoryChain "$INSTDIR"
  !insertmacro CheckDirectory "$INSTDIR\resources"
  ReadRegStr $1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" PayloadArch
  SetOutPath "$TEMP"
  !ifdef APP_ARM64
    ${If} $1 == "ARM64"
      !include "${PROJECT_DIR}\out\nsis\arm64.nsh"
      Goto removedPayload
    ${EndIf}
  !endif
  !ifdef APP_64
    ${If} $1 == "64"
      !include "${PROJECT_DIR}\out\nsis\x64.nsh"
      Goto removedPayload
    ${EndIf}
  !endif
  !ifdef APP_32
    ${If} $1 == "32"
      !include "${PROJECT_DIR}\out\nsis\ia32.nsh"
      Goto removedPayload
    ${EndIf}
  !endif
  !insertmacro RejectInstallation "Cannot determine which installed files belong to this application."
  removedPayload:
  ; electron-builder adds this helper to the NSIS archive after afterPack.
  !insertmacro RemoveInstalledFile "$INSTDIR\resources\elevate.exe"
  RMDir "$INSTDIR\resources"
  !insertmacro RemoveInstalledFile "$INSTDIR\${UNINSTALL_FILENAME}"
  RMDir "$INSTDIR"
!macroend
