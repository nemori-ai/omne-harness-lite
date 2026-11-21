; The assisted directory page accepts arbitrary paths, including silent /D overrides.
; Validate the final scope and destination after any elevation and before the
; builder can uninstall an older version or extract any application files.
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

!macro CheckPreviousInstallation ROOT STALE
  ReadRegStr $0 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" UninstallString
  !ifdef UNINSTALL_REGISTRY_KEY_2
    ${If} $0 == ""
      ReadRegStr $0 ${ROOT} "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    ${EndIf}
  !endif
  ${If} $0 != ""
    ReadRegStr $1 ${ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $1 == ""
      !insertmacro RejectInstallation "The registered installation has no location. Resolve its registration before continuing."
    ${EndIf}
    !insertmacro CheckDirectoryChain "$1"
    System::Call 'kernel32::GetFileAttributesW(w r1) i.r2 ?e'
    Pop $R9
    ${If} $2 == -1
      ; A disconnected volume can also report PATH_NOT_FOUND. Retire registrations
      ; only for absolute paths on a mounted local fixed drive, after checking ancestors.
      ${If} $R9 != 2
      ${AndIf} $R9 != 3
        !insertmacro RejectInstallation "Cannot inspect the old installation in '$1' (Windows error $R9). Check its permissions and retry."
      ${EndIf}
      StrCpy $R8 $1 3
      StrCpy $R7 $R8 2 1
      System::Call 'kernel32::GetDriveTypeW(w R8) i.r2'
      System::Call 'kernel32::GetFileAttributesW(w R8) i.r6'
      ${If} $6 == -1
      ${OrIf} $R7 != ":\"
      ${OrIf} $2 != 3 ; DRIVE_FIXED
        !insertmacro RejectInstallation "Cannot confirm the old installation in '$1' is gone. Reconnect its drive and check permissions before retrying."
      ${EndIf}
      StrCpy ${STALE} 1
    ${Else}
      ReadRegStr $2 ${ROOT} "${INSTALL_REGISTRY_KEY}" FileScopedUninstaller
      ${If} $2 != "1"
      ${OrIfNot} ${FileExists} "$1\${UNINSTALL_FILENAME}"
        !insertmacro RejectInstallation "Cannot safely upgrade the registered installation in '$1'. Back up its directory and resolve the old installation before continuing."
      ${EndIf}
      ${If} $1 == $INSTDIR
        StrCpy $3 "owned"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; electron-builder consults both uninstall keys before extracting. Clear the
; stale scope only after every registration and the new destination passed.
!macro RemoveStaleUninstallKey ROOT KEY
  ReadRegStr $0 ${ROOT} "${KEY}" UninstallString
  ${If} $0 != ""
    ClearErrors
    DeleteRegKey ${ROOT} "${KEY}"
    ${If} ${Errors}
      !insertmacro RejectInstallation "Cannot remove the stale uninstall registration. Check registry permissions before retrying."
    ${EndIf}
  ${EndIf}
!macroend

!macro RemoveStaleRegistration ROOT
  !ifdef UNINSTALL_REGISTRY_KEY_2
    !insertmacro RemoveStaleUninstallKey ${ROOT} "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  !insertmacro RemoveStaleUninstallKey ${ROOT} "${UNINSTALL_REGISTRY_KEY}"
  ClearErrors
  DeleteRegKey ${ROOT} "${INSTALL_REGISTRY_KEY}"
  ${If} ${Errors}
    !insertmacro RejectInstallation "Cannot remove the stale installation location. Check registry permissions before retrying."
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

  !endif
!macroend

!macro customCheckInstallationDirectory
  !insertmacro CheckDirectoryChain "$INSTDIR"
  StrCpy $3 ""
  StrCpy $4 0
  StrCpy $5 0
  !insertmacro CheckPreviousInstallation SHELL_CONTEXT $4
  ${If} $installMode == "all"
    ; A per-machine install also uninstalls an existing per-user version.
    !insertmacro CheckPreviousInstallation HKCU $5
  ${EndIf}
  ${If} $3 != "owned"
    Call CheckEmptyDestination
  ${EndIf}
  ${If} $4 == 1
    !insertmacro RemoveStaleRegistration SHELL_CONTEXT
  ${EndIf}
  ${If} $5 == 1
    !insertmacro RemoveStaleRegistration HKCU
  ${EndIf}
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
